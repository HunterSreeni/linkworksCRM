import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { pollCycle, resetPollerState } from '../services/email/poller.js';

const router = Router();

// POST /api/emails/poll - Manually trigger an immediate poll cycle.
// Pass { reset: true } to also reset the in-memory UID tracker so
// every email in the inbox is reconsidered (use after a DB wipe).
router.post('/poll', authenticate, async (req, res) => {
  try {
    if (req.body?.reset === true) {
      resetPollerState();
    }
    await pollCycle();
    return res.json({ ok: true });
  } catch (err) {
    console.error('Manual poll error:', err);
    return res.status(500).json({ error: err.message || 'Poll failed' });
  }
});

const VALID_CLASSIFICATIONS = ['booking', 'query', 'bounce', 'auto_reply', 'noise', 'unclassified'];

// GET /api/emails - List emails with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { direction, classification, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabaseAdmin
      .from('emails')
      .select('*', { count: 'exact' })
      .order('received_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (direction) {
      query = query.eq('direction', direction);
    }
    if (classification) {
      const classes = classification.split(',').map(c => c.trim());
      if (classes.length > 1) {
        query = query.in('classification', classes);
      } else {
        query = query.eq('classification', classification);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      emails: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('List emails error:', err);
    return res.status(500).json({ error: 'Failed to list emails' });
  }
});

// GET /api/emails/:id - Single email with attachments
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: email, error } = await supabaseAdmin
      .from('emails')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const { data: attachments } = await supabaseAdmin
      .from('attachments')
      .select('*')
      .eq('email_id', id);

    return res.json({
      email,
      attachments: attachments || [],
    });
  } catch (err) {
    console.error('Get email error:', err);
    return res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// POST /api/emails/:id/classify - Manually classify an email
router.post('/:id/classify', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { classification } = req.body;

    if (!classification || !VALID_CLASSIFICATIONS.includes(classification)) {
      return res.status(400).json({
        error: `Invalid classification. Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('emails')
      .update({
        classification,
        is_processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Email not found' });
    }

    return res.json({ email: data });
  } catch (err) {
    console.error('Classify email error:', err);
    return res.status(500).json({ error: 'Failed to classify email' });
  }
});

export default router;
