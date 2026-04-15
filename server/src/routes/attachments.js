import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

// GET /api/attachments/:id/download - return a short-lived signed URL
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: att, error: lookupErr } = await supabaseAdmin
      .from('attachments')
      .select('id, email_id, filename, storage_path, file_type')
      .eq('id', id)
      .single();

    if (lookupErr || !att) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (!att.storage_path) {
      return res.status(410).json({
        error: 'Attachment content is not stored. It may have been received before storage was enabled.',
      });
    }

    // Authorization - attachment must be linked to a request this user can see.
    // Admins can see all; members only requests assigned to them or unassigned.
    // If the linked email has no request yet (stored but not triaged), admin only.
    const { data: linkedRequest } = await supabaseAdmin
      .from('requests')
      .select('id, assigned_to')
      .or(`inbound_email_id.eq.${att.email_id},outbound_email_id.eq.${att.email_id}`)
      .maybeSingle();

    if (req.role !== 'admin') {
      if (!linkedRequest) {
        return res.status(403).json({ error: 'Not authorized to download this attachment' });
      }
      const isAssigned = linkedRequest.assigned_to === req.user.id;
      const isUnassigned = !linkedRequest.assigned_to;
      if (!isAssigned && !isUnassigned) {
        return res.status(403).json({ error: 'Not authorized to download this attachment' });
      }
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from('email-attachments')
      .createSignedUrl(att.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: att.filename || true,
      });

    if (signErr) {
      console.error('Signed URL error:', signErr);
      return res.status(500).json({ error: 'Could not generate download URL' });
    }

    return res.json({
      url: signed.signedUrl,
      filename: att.filename,
      file_type: att.file_type,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    console.error('Download attachment error:', err);
    return res.status(500).json({ error: 'Failed to create download URL' });
  }
});

export default router;
