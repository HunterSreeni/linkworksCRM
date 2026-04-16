import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { renderEmailTemplate } from '../utils/templateEngine.js';

const router = Router();

const VEHICLE_DISPLAY_NAMES = {
  standard: 'Standard',
  tailift: 'Tail Lift',
  oog: 'Out of Gauge (OOG)',
  curtain_side: 'Curtain Side',
};

/**
 * Format an ISO date string into a readable format for emails.
 * e.g. "2026-04-17T10:20:00+00:00" -> "17 April 2026 at 10:20"
 */
function formatDateForEmail(isoDate) {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    const day = d.getUTCDate();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} at ${hours}:${minutes}`;
  } catch {
    return isoDate;
  }
}

/**
 * Format a vehicle enum value into a readable display name.
 */
function formatVehicleType(vehicle) {
  if (!vehicle) return null;
  return VEHICLE_DISPLAY_NAMES[vehicle] || vehicle;
}

/**
 * Create an SMTP transporter from environment variables.
 * Validates that required SMTP env vars are set before creating the transport.
 */
function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    const missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASSWORD');
    throw new Error(
      `SMTP not configured. Missing env vars: ${missing.join(', ')}. ` +
      'Set these in server/.env (local) or the host dashboard (Vercel/Netlify).'
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Send email via Microsoft Graph API (production).
 * Placeholder - throws if called without proper configuration.
 */
async function sendViaGraphApi(to, subject, body) {
  // TODO: Implement Graph API email sending
  // POST https://graph.microsoft.com/v1.0/users/{GRAPH_MAILBOX}/sendMail
  // Headers: Authorization: Bearer {access_token}, Content-Type: application/json
  // Body: { message: { subject, body: { contentType: "HTML", content: body }, toRecipients: [{ emailAddress: { address: to } }] } }
  //
  // To get access_token:
  // POST https://login.microsoftonline.com/{GRAPH_TENANT_ID}/oauth2/v2.0/token
  // Body: client_id, client_secret, scope=https://graph.microsoft.com/.default, grant_type=client_credentials
  throw new Error('Graph API not yet implemented. Set GRAPH_API_ENABLED=false to use SMTP.');
}

/**
 * Log an audit entry.
 */
async function logAudit(requestId, userId, action, details = {}) {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    id: uuidv4(),
    user_id: userId,
    action,
    entity_type: 'request',
    entity_id: requestId,
    details,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('Audit log insert failed:', error.message);
  }
}

// POST /api/reply - Send a reply email using a template
router.post('/', authenticate, async (req, res) => {
  try {
    const { request_id, template_id, placeholder_values = {} } = req.body;

    if (!request_id || !template_id) {
      return res.status(400).json({ error: 'request_id and template_id are required' });
    }

    // Fetch the request
    const { data: request, error: reqError } = await supabaseAdmin
      .from('requests')
      .select('*')
      .eq('id', request_id)
      .single();

    if (reqError || !request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Derive customer email from the linked inbound email
    let customerEmail = null;
    if (request.inbound_email_id) {
      const { data: inboundEmail } = await supabaseAdmin
        .from('emails')
        .select('from_address')
        .eq('id', request.inbound_email_id)
        .single();
      customerEmail = inboundEmail?.from_address || null;
    }

    if (!customerEmail) {
      return res.status(400).json({ error: 'Request has no linked inbound email with a from address' });
    }

    // Fetch the template
    const { data: template, error: tplError } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (tplError || !template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Merge request data with explicit placeholder values (explicit values take precedence)
    const mergedValues = {
      docket_number: request.docket_number,
      customer_ref: request.customer_ref_number,
      account_code: request.account_code,
      collection_address: request.collection_address,
      delivery_address: request.delivery_address,
      collection_date: formatDateForEmail(request.collection_datetime),
      delivery_date: formatDateForEmail(request.delivery_datetime),
      vehicle_type: formatVehicleType(request.vehicle),
      hazardous: request.is_hazardous ? 'Yes' : 'No',
      weight: request.weight
        ? `${request.weight} ${request.weight_unit || 'kg'}`
        : null,
      dimensions: request.dimensions
        ? `${request.dimensions} ${request.dimensions_unit || 'cm'}`
        : null,
      customer_name: customerEmail,
      ...placeholder_values,
    };

    // Render the template
    const rendered = renderEmailTemplate(template, mergedValues);

    // Send the email
    const useGraphApi = process.env.GRAPH_API_ENABLED === 'true';

    if (useGraphApi) {
      await sendViaGraphApi(customerEmail, rendered.subject, rendered.body);
    } else {
      const transporter = createSmtpTransport();
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: customerEmail,
        subject: rendered.subject,
        html: rendered.body,
      });
    }

    // Create outbound email record (matching the emails table schema)
    const outboundEmail = {
      id: uuidv4(),
      direction: 'outbound',
      classification: 'booking',
      from_address: process.env.SMTP_USER || process.env.GRAPH_MAILBOX,
      to_address: customerEmail,
      subject: rendered.subject,
      body_raw: rendered.body,
      body_clean: rendered.body,
      has_attachments: false,
      is_processed: true,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const { data: savedEmail, error: emailInsertError } = await supabaseAdmin
      .from('emails')
      .insert(outboundEmail)
      .select()
      .single();

    if (emailInsertError) {
      console.error('Failed to save outbound email record:', emailInsertError.message);
    }

    // Link the outbound email to the request and advance status to 'replied'
    const requestUpdate = {
      outbound_email_id: savedEmail?.id || null,
      status: 'replied',
      updated_at: new Date().toISOString(),
    };

    const { error: linkError } = await supabaseAdmin
      .from('requests')
      .update(requestUpdate)
      .eq('id', request_id);
    if (linkError) {
      console.error('Failed to update request after reply:', linkError.message);
    }

    // Log audit
    await logAudit(request_id, req.user.id, 'REPLY_SENT', {
      template_id,
      email_id: outboundEmail.id,
      to: customerEmail,
    });

    return res.json({
      message: 'Reply sent successfully',
      email: outboundEmail,
    });
  } catch (err) {
    console.error('Send reply error:', err);
    return res.status(500).json({ error: 'Failed to send reply: ' + err.message });
  }
});

export default router;
