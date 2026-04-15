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
let lastSeenUid = 0;
let isPolling = false;

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

    // Store attachments (metadata only - content parsing disabled for v0.1.4)
    for (const att of email.attachments || []) {
      const attachmentRecord = {
        id: uuidv4(),
        email_id: emailId,
        filename: att.filename,
        content_type: att.content_type,
        size: att.size,
        created_at: new Date().toISOString(),
      };
      await supabaseAdmin.from('attachments').insert(attachmentRecord);
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
 * Run a single poll cycle - connect, fetch, process, disconnect.
 */
export function resetPollerState() {
  lastSeenUid = 0;
}

export async function pollCycle() {
  if (isPolling) {
    console.log('[Poller] Previous poll still running, skipping');
    return;
  }

  isPolling = true;
  const adapter = getEmailAdapter();

  try {
    await adapter.connect();

    const emails = await adapter.fetchNewEmails(lastSeenUid);
    console.log(`[Poller] Fetched ${emails.length} new email(s)`);

    for (const email of emails) {
      await processEmail(email);

      // Track the highest UID seen
      if (email.uid && email.uid > lastSeenUid) {
        lastSeenUid = email.uid;
      }
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
