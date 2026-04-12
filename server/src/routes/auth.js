import { Router } from 'express';
import { supabaseAdmin, supabaseAnon } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login - Sign in with email and password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // Fetch user profile with role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', data.user.id)
      .single();

    if (profile && !profile.is_active) {
      return res.status(403).json({ error: 'Account deactivated. Contact admin.' });
    }

    return res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: profile || { email: data.user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout - Sign out
router.post('/logout', authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // For Supabase JWT users, sign out on server side
      // Note: supabaseAdmin.auth.admin.signOut is not available,
      // client-side token invalidation is handled by the frontend
    }
    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/me - Get current user profile with role
router.get('/me', authenticate, async (req, res) => {
  try {
    return res.json({ user: req.user });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;
