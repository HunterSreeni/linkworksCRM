import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/dashboard/stats - Overview statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    // Run all count queries in parallel instead of sequentially
    const [totalRes, thisMonthRes, prevMonthRes, todayRes, pendingRes] = await Promise.all([
      supabaseAdmin.from('requests').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', thisMonthStart),
      supabaseAdmin.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', prevMonthStart).lte('created_at', prevMonthEnd),
      supabaseAdmin.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabaseAdmin.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    ]);

    return res.json({
      total_requests: totalRes.count || 0,
      requests_this_month: thisMonthRes.count || 0,
      requests_prev_month: prevMonthRes.count || 0,
      today_requests: todayRes.count || 0,
      pending_requests: pendingRes.count || 0,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/dashboard/weekly - Requests per day for last 7 days
router.get('/weekly', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const startDate = sevenDaysAgo.toISOString();

    // Single query - fetch all requests from last 7 days, group client-side
    const { data, error } = await supabaseAdmin
      .from('requests')
      .select('created_at')
      .gte('created_at', startDate)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Build day counts from the results
    const dayCounts = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dayCounts[key] = 0;
    }

    for (const row of data || []) {
      const key = row.created_at.slice(0, 10);
      if (key in dayCounts) {
        dayCounts[key]++;
      }
    }

    const weekly = Object.entries(dayCounts).map(([date, count]) => {
      const d = new Date(date + 'T00:00:00');
      return {
        date,
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count,
      };
    });

    return res.json({ weekly });
  } catch (err) {
    console.error('Dashboard weekly error:', err);
    return res.status(500).json({ error: 'Failed to fetch weekly data' });
  }
});

// GET /api/dashboard/hourly - Requests per hour for today
router.get('/hourly', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    // Single query - fetch all of today's requests, group by hour client-side
    const { data, error } = await supabaseAdmin
      .from('requests')
      .select('created_at')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Initialize all 24 hours
    const hourCounts = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${h.toString().padStart(2, '0')}:00`,
      count: 0,
    }));

    for (const row of data || []) {
      const hour = new Date(row.created_at).getHours();
      hourCounts[hour].count++;
    }

    return res.json({ hourly: hourCounts });
  } catch (err) {
    console.error('Dashboard hourly error:', err);
    return res.status(500).json({ error: 'Failed to fetch hourly data' });
  }
});

// GET /api/dashboard/team-activity - Active/idle status per team member
router.get('/team-activity', authenticate, async (req, res) => {
  try {
    // Fetch all active users
    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, updated_at')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const teamActivity = (users || []).map((user) => {
      const isActive = user.updated_at && user.updated_at > fifteenMinutesAgo;
      return {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        status: isActive ? 'active' : 'idle',
        last_active_at: user.updated_at,
      };
    });

    return res.json({ team: teamActivity });
  } catch (err) {
    console.error('Team activity error:', err);
    return res.status(500).json({ error: 'Failed to fetch team activity' });
  }
});

export default router;
