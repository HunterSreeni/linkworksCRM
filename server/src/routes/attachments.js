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
      .select('id, filename, storage_path, file_type')
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
