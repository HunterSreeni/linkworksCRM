import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/users - List all users
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .order('full_name', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ users: data });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/users - Create user (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email, full_name, role = 'member', password } = req.body;

    if (!email || !full_name) {
      return res.status(400).json({ error: 'email and full_name are required' });
    }

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or member' });
    }

    // Create Supabase auth user if password provided
    let authId = null;
    if (password) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        return res.status(400).json({ error: 'Failed to create auth user: ' + authError.message });
      }
      authId = authData.user.id;
    }

    const newUser = {
      id: authId || uuidv4(),
      email,
      full_name,
      role,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert(newUser)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ user: data });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/users/:id - Update user role/active status (admin only)
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, is_active, full_name } = req.body;

    const updates = {};
    if (role !== undefined) {
      if (!['admin', 'member'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin or member' });
      }
      updates.role = role;
    }
    if (is_active !== undefined) updates.is_active = is_active;
    if (full_name !== undefined) updates.full_name = full_name;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: data });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - Deactivate user (admin only, soft delete)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ message: 'User deactivated', user: data });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

export default router;
