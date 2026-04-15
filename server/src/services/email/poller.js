import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../../config/supabase.js';
import { getEmailAdapter } from './adapter.js';
// TODO(v0.2.0): re-enable when LLM parser middleware lands
// import { classifyEmail } from './classifier.js';
// import { extractFromEmail } from './parser.js';
// import { parseAttachmentContent } from '../attachmentParser.js';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function toIsoTimestamp(raw) {
  if (!raw) return null;
  const text = String(raw);
  const m = text.match(
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})(?:[^\d]*?(\d{1,2}):(\d{2}))?/i
  );
  if (!m) {
    const fallback = Date.parse(text);
    return Number.isNaN(fallback) ? null : new Date(fallback).toISOString();
  }
  const [, day, month, year, hour, minute] = m;
  const date = new Date(Date.UTC(
    Number(year),
    MONTHS.indexOf(month.toLowerCase()),
    Number(day),
    hour ? Number(hour) : 0,
    minute ? Number(minute) : 0,
  ));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const VEHICLE_ENUM_MAP = [
  { match: /tail[\s-]?lift|moffett/i, value: 'tailift' },
  { match: /curtain[\s-]?side|tautliner/i, value: 'curtain_side' },
  { match: /low[\s-]?loader|out[\s-]?of[\s-]?gauge|abnormal/i, value: 'oog' },
];

function normaliseVehicle(raw, fullText) {
  const haystack = `${raw || ''} ${fullText || ''}`;
  for (const { match, value } of VEHICLE_ENUM_MAP) {
    if (match.test(haystack)) return value;
  }
  return raw ? 'standard' : null;
}

let pollingInterval = null;
let isPolling = false;

/**
 * Read the high watermark from the DB - the highest IMAP UID we've already
 * stored. Survives restarts, DB wipes, and accidental in-memory state loss.
 * Returns 0 if no emails have an imap_uid yet (e.g. fresh DB or first poll).
 */
async function getWatermark() {
  const { data, error } = await supabaseAdmin
    .from('emails')
    .select('imap_uid')
    .not('imap_uid', 'is', null)
    .order('imap_uid', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[Poller] Failed to read watermark, defaulting to 0:', error.message);
    return 0;
  }
  return data?.imap_uid || 0;
}

/**
 * Process a single fetched email.
 *
 * v0.1.4 "Raw email mode": store the email + its attachment metadata, then
 * unconditionally create a Draft request linked back via inbound_email_id.
 * All structured extraction fields are left null; the user reads the raw
 * body on the request detail page and fills them in manually.
 *
 * The classifier, regex extractor, and attachment text parser are
 * intentionally commented (not removed) and will be re-enabled in v0.2.0
 * once the LLM parser middleware lands.
 */
async function processEmail(email) {
  try {
    const emailId = uuidv4();

    // TODO(v0.2.0): re-enable classifier routing once LLM parser can emit
    // a confidence score for "is this a booking?". For v0.1.4 every email
    // becomes a Draft request and the classification column stays 'unclassified'.
    // const { classification, reason } = classifyEmail(email);

    // Store the email record (matching emails table schema)
    const emailRecord = {
      id: emailId,
      graph_message_id: email.message_id || null,
      imap_uid: email.uid || null,
      thread_id: email.in_reply_to || null,
      direction: 'inbound',
      classification: 'unclassified',
      subject: email.subject,
      from_address: email.from_address,
      to_address: email.to_address,
      cc_address: null,
      body_raw: email.body_html || email.body_text || '',
      body_clean: email.body_text || '',
      has_attachments: (email.attachments || []).length > 0,
      is_processed: true,
      received_at: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
      processed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const { error: emailError } = await supabaseAdmin.from('emails').insert(emailRecord);
    if (emailError) {
      console.error('[Poller] Failed to store email:', emailError.message);
      return;
    }

    // Store attachments: upload binary to Supabase Storage, then insert row.
    // Storage path: email-attachments/{email_id}/{attachment_id}_{filename}
    for (const att of email.attachments || []) {
      const attachmentId = uuidv4();
      const safeName = (att.filename || 'unnamed').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${emailId}/${attachmentId}_${safeName}`;

      let uploadOk = false;
      if (att.content && Buffer.isBuffer(att.content)) {
        const { error: upErr } = await supabaseAdmin.storage
          .from('email-attachments')
          .upload(storagePath, att.content, {
            contentType: att.content_type || 'application/octet-stream',
            upsert: false,
          });
        if (upErr) {
          console.error(`[Poller] Attachment upload failed (${att.filename}):`, upErr.message);
        } else {
          uploadOk = true;
        }
      }

      const { error: attErr } = await supabaseAdmin.from('attachments').insert({
        id: attachmentId,
        email_id: emailId,
        filename: att.filename || 'unnamed',
        file_type: att.content_type || null,
        file_size: att.size || null,
        storage_path: uploadOk ? storagePath : null,
        created_at: new Date().toISOString(),
      });
      if (attErr) {
        console.error(`[Poller] Failed to store attachment row (${att.filename}):`, attErr.message);
      }
    }

    // TODO(v0.2.0): restore classifier-driven routing. Kept as reference for
    // when the LLM parser replaces the regex extraction layer.
    //
    // if (classification === 'noise') {
    //   console.log(`[Poller] Discarded noise email: ${email.subject}`);
    //   return;
    // }
    //
    // if (classification === 'bounce' && email.in_reply_to) {
    //   const { data: originalEmail } = await supabaseAdmin
    //     .from('emails').select('id').eq('graph_message_id', email.in_reply_to).single();
    //   if (originalEmail) {
    //     const { data: linkedRequest } = await supabaseAdmin
    //       .from('requests').select('id').eq('outbound_email_id', originalEmail.id).single();
    //     if (linkedRequest) {
    //       await supabaseAdmin.from('requests')
    //         .update({ status: 'delivery_failed', updated_at: new Date().toISOString() })
    //         .eq('id', linkedRequest.id).in('status', ['replied', 'processing']);
    //       console.log(`[Poller] Bounce linked to request ${linkedRequest.id}`);
    //     }
    //   }
    //   return;
    // }
    //
    // if (classification === 'query' && email.in_reply_to) {
    //   const { data: threadEmail } = await supabaseAdmin
    //     .from('emails').select('id').eq('graph_message_id', email.in_reply_to).single();
    //   if (threadEmail) {
    //     const { data: linkedRequest } = await supabaseAdmin.from('requests').select('id')
    //       .or(`inbound_email_id.eq.${threadEmail.id},outbound_email_id.eq.${threadEmail.id}`)
    //       .limit(1).single();
    //     if (linkedRequest) console.log(`[Poller] Query related to request ${linkedRequest.id}`);
    //   }
    //   return;
    // }

    // TODO(v0.2.0): restore regex + attachment extraction. Left here for reference.
    //
    // let extractedData = extractFromEmail(email.body_text);
    // for (const att of email.attachments || []) {
    //   try {
    //     const attText = await parseAttachmentContent(att.content, att.content_type);
    //     if (attText) {
    //       const attData = extractFromEmail(attText);
    //       for (const [key, val] of Object.entries(attData)) {
    //         if (extractedData[key].confidence === 'missing' && val.confidence !== 'missing') {
    //           extractedData[key] = val;
    //         }
    //       }
    //     }
    //   } catch (attErr) {
    //     console.error(`[Poller] Failed to parse attachment ${att.filename}:`, attErr.message);
    //   }
    // }

    // v0.1.4: create a Draft request for every email with null extraction fields.
    // User reads the raw body on the request detail page and fills details manually.
    const requestId = uuidv4();
    const requestRecord = {
      id: requestId,
      inbound_email_id: emailId,
      status: 'draft',
      collection_address: null,
      delivery_address: null,
      collection_datetime: null,
      delivery_datetime: null,
      is_hazardous: null,
      weight: null,
      dimensions: null,
      quantity: null,
      vehicle: null,
      customer_ref_number: null,
      account_code: null,
      docket_number: null,
      assigned_to: null,
      confirmed_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: reqError } = await supabaseAdmin.from('requests').insert(requestRecord);
    if (reqError) {
      console.error(`[Poller] FAILED to create request from "${email.subject}":`, reqError.message);
      return;
    }

    console.log(`[Poller] Created request ${requestId} from: ${email.subject}`);
  } catch (err) {
    console.error('[Poller] Error processing email:', err);
  }
}

/**
 * v0.1.6: kept for backwards compat with the manual /api/emails/poll
 * endpoint's `{ reset: true }` flag. With the DB watermark there's no
 * in-memory state to reset - this is now a no-op. Leave the export so
 * the route doesn't error.
 */
export function resetPollerState() {
  // No-op since v0.1.6 - watermark lives in the emails.imap_uid column.
}

/**
 * Run a single poll cycle - read DB watermark, connect, fetch, process, disconnect.
 */
export async function pollCycle() {
  if (isPolling) {
    console.log('[Poller] Previous poll still running, skipping');
    return;
  }

  isPolling = true;
  const adapter = getEmailAdapter();

  try {
    const watermark = await getWatermark();
    await adapter.connect();

    const emails = await adapter.fetchNewEmails(watermark);
    console.log(`[Poller] Fetched ${emails.length} new email(s) (watermark UID ${watermark})`);

    for (const email of emails) {
      await processEmail(email);
    }

    await adapter.disconnect();
  } catch (err) {
    console.error('[Poller] Poll cycle error:', err.message);
    try {
      await adapter.disconnect();
    } catch (_) {
      // Ignore disconnect errors
    }
  } finally {
    isPolling = false;
  }
}

/**
 * Start the email polling service.
 * Polls at the interval specified by EMAIL_POLL_INTERVAL_MS.
 */
export function startPolling() {
  const intervalMs = parseInt(process.env.EMAIL_POLL_INTERVAL_MS) || 60000;

  console.log(`[Poller] Starting email polling every ${intervalMs / 1000}s`);

  // Run immediately, then on interval
  pollCycle();
  pollingInterval = setInterval(pollCycle, intervalMs);
}

/**
 * Stop the email polling service.
 */
export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Poller] Email polling stopped');
  }
}

/**
 * Check if polling is currently active.
 */
export function isPollingActive() {
  return pollingInterval !== null;
}
