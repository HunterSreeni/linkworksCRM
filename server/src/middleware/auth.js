import { supabaseAdmin } from '../config/supabase.js';

// API key auth is only available when explicitly configured via env.
// No default fallback - never ship a well-known shared secret to production.
const API_KEY = process.env.API_KEY;

/**
 * Authenticate requests via Bearer token (Supabase JWT) or x-api-key header.
 * Attaches user and role to req on success.
 */
export async function authenticate(req, res, next) {
  try {
    // API key mode - only accepted when API_KEY is set and client supplies it.
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      if (!API_KEY) {
        return res.status(401).json({ error: 'API key auth disabled - use Bearer token' });
      }
      if (apiKey !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      // For API key mode, attach a synthetic user
      req.user = {
        id: 'api-key-user',
        email: 'api@linkworks.local',
        role: 'admin',
      };
      req.role = 'admin';
      return next();
    }

    // Bearer token mode - Supabase JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const supabaseUser = data.user;

    // Fetch the user profile with role from the profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', supabaseUser.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'User profile not found. Contact admin.' });
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'Account deactivated. Contact admin.' });
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
    };
    req.role = profile.role;

    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Require admin role. Must be used after authenticate middleware.
 */
export function requireAdmin(req, res, next) {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}
