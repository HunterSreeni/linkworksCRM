import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && 'SUPABASE_URL',
    !supabaseServiceKey && 'SUPABASE_SERVICE_KEY',
    !supabaseAnonKey && 'SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ');
  throw new Error(
    `Missing required Supabase env var(s): ${missing}. ` +
    `Set these in server/.env (local) or the host dashboard (Vercel/Netlify).`
  );
}

// Service role client - bypasses RLS, used for server-side operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Anon client - respects RLS, used for auth verification
export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

export default supabaseAdmin;
