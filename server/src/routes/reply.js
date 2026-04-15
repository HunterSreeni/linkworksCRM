import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { renderEmailTemplate } from '../utils/templateEngine.js';

const router = Router();

/**
 * Create an SMTP transporter from environment variables.
 */
function createSmtpTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
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
      delivery_date: request.delivery_datetime,
      vehicle_type: request.vehicle,
      hazardous: request.is_hazardous ? 'Yes' : 'No',
      weight: request.weight,
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

    // Link the outbound email to the request
    if (savedEmail) {
      const { error: linkError } = await supabaseAdmin
        .from('requests')
        .update({ outbound_email_id: savedEmail.id, updated_at: new Date().toISOString() })
        .eq('id', request_id);
      if (linkError) {
        console.error('Failed to link outbound email to request:', linkError.message);
      }
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
