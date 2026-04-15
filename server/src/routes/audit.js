import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/audit - List audit entries with filters and pagination
// Admins see all entries, members see only their own
router.get('/', authenticate, async (req, res) => {
  try {
    const { entity_id, entity_type, action, user_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabaseAdmin
      .from('audit_log')
      .select('*, user:profiles!user_id(email,full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Non-admin users can only see their own audit entries
    if (req.role !== 'admin') {
      query = query.eq('user_id', req.user.id);
    } else if (user_id) {
      // Admin can filter by user_id
      query = query.eq('user_id', user_id);
    }

    if (entity_id) {
      query = query.eq('entity_id', entity_id);
    }
    if (entity_type) {
      query = query.eq('entity_type', entity_type);
    }
    if (action) {
      query = query.eq('action', action);
    }

    const { data, error, count } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      audit_logs: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('List audit logs error:', err);
    return res.status(500).json({ error: 'Failed to list audit logs' });
  }
});

export default router;
