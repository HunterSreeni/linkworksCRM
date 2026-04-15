import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Valid status transitions (lowercase to match DB enum)
const STATUS_TRANSITIONS = {
  draft: ['confirmed'],
  confirmed: ['processing'],
  processing: ['replied', 'delivery_failed'],
  replied: ['closed', 'delivery_failed'],
  delivery_failed: ['processing', 'closed'],
  closed: [],
};

/**
 * Log an audit entry for a request change.
 */
async function logAudit(requestId, userId, action, details = {}) {
  try {
    await supabaseAdmin.from('audit_log').insert({
      id: uuidv4(),
      user_id: userId,
      action,
      entity_type: 'request',
      entity_id: requestId,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// GET /api/requests - List requests with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, assigned_to, search, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabaseAdmin
      .from('requests')
      .select(
        '*, inbound_email:emails!inbound_email_id(subject,from_address,to_address,received_at)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      if (statuses.length > 1) {
        query = query.in('status', statuses);
      } else {
        query = query.eq('status', status);
      }
    }
    if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }
    if (search) {
      query = query.or(
        `docket_number.ilike.%${search}%,customer_ref_number.ilike.%${search}%,account_code.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      requests: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('List requests error:', err);
    return res.status(500).json({ error: 'Failed to list requests' });
  }
});

// GET /api/requests/:id - Single request with linked emails and attachments
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: request, error } = await supabaseAdmin
      .from('requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Fetch linked emails via inbound_email_id and outbound_email_id
    const emailIds = [request.inbound_email_id, request.outbound_email_id].filter(Boolean);
    let emails = [];
    if (emailIds.length > 0) {
      const { data: linkedEmails } = await supabaseAdmin
        .from('emails')
        .select('*')
        .in('id', emailIds)
        .order('received_at', { ascending: false });
      emails = linkedEmails || [];
    }

    // Fetch attachments linked to those emails
    let attachments = [];
    if (emailIds.length > 0) {
      const { data: linkedAttachments } = await supabaseAdmin
        .from('attachments')
        .select('*')
        .in('email_id', emailIds);
      attachments = linkedAttachments || [];
    }

    return res.json({
      request,
      emails,
      attachments,
    });
  } catch (err) {
    console.error('Get request error:', err);
    return res.status(500).json({ error: 'Failed to fetch request' });
  }
});

// POST /api/requests - Create a new request
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      inbound_email_id,
      collection_address,
      delivery_address,
      collection_datetime,
      delivery_datetime,
      vehicle,
      is_hazardous,
      weight,
      dimensions,
      quantity,
      customer_ref_number,
      account_code,
      docket_number,
      pricing_category,
      estimated_cost,
    } = req.body;

    const newRequest = {
      id: uuidv4(),
      inbound_email_id: inbound_email_id || null,
      status: 'draft',
      collection_address: collection_address || null,
      delivery_address: delivery_address || null,
      collection_datetime: collection_datetime || null,
      delivery_datetime: delivery_datetime || null,
      vehicle: vehicle || null,
      is_hazardous: is_hazardous || false,
      weight: weight || null,
      dimensions: dimensions || null,
      quantity: quantity || null,
      customer_ref_number: customer_ref_number || null,
      account_code: account_code || null,
      docket_number: docket_number || null,
      pricing_category: pricing_category || null,
      estimated_cost: estimated_cost || null,
      assigned_to: null,
      confirmed_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('requests')
      .insert(newRequest)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    await logAudit(data.id, req.user.id, 'REQUEST_CREATED', {});

    return res.status(201).json({ request: data });
  } catch (err) {
    console.error('Create request error:', err);
    return res.status(500).json({ error: 'Failed to create request' });
  }
});

// PATCH /api/requests/:id - Update request fields
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    // Don't allow overriding certain fields via generic update
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;

    const { data, error } = await supabaseAdmin
      .from('requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Request not found' });
    }

    await logAudit(id, req.user.id, 'REQUEST_UPDATED', {
      fields_changed: Object.keys(req.body),
    });

    return res.json({ request: data });
  } catch (err) {
    console.error('Update request error:', err);
    return res.status(500).json({ error: 'Failed to update request' });
  }
});

// PATCH /api/requests/:id/status - Update status with transition validation
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    if (!newStatus) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Fetch current request
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('requests')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const allowedTransitions = STATUS_TRANSITIONS[current.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return res.status(400).json({
        error: `Invalid status transition: ${current.status} -> ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    await logAudit(id, req.user.id, 'STATUS_CHANGED', {
      from: current.status,
      to: newStatus,
    });

    return res.json({ request: data });
  } catch (err) {
    console.error('Update status error:', err);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/requests/:id/assign - Assign to a team member
router.patch('/:id/assign', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!assigned_to) {
      return res.status(400).json({ error: 'assigned_to is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('requests')
      .update({ assigned_to, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Request not found' });
    }

    await logAudit(id, req.user.id, 'REQUEST_ASSIGNED', { assigned_to });

    return res.json({ request: data });
  } catch (err) {
    console.error('Assign request error:', err);
    return res.status(500).json({ error: 'Failed to assign request' });
  }
});

// GET /api/requests/:id/history - Audit history for this request
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data, error, count } = await supabaseAdmin
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('request_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      history: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
      },
    });
  } catch (err) {
    console.error('Get history error:', err);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/requests/search - Global search across key fields
router.post('/search', authenticate, async (req, res) => {
  try {
    const { query, page = 1, limit = 25 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchTerm = query.trim();

    const { data, error, count } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact' })
      .or(
        `docket_number.ilike.%${searchTerm}%,customer_ref_number.ilike.%${searchTerm}%,account_code.ilike.%${searchTerm}%`
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      requests: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
