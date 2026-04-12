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

    // Total requests
    const { count: totalRequests } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact', head: true });

    // Requests this month
    const { count: requestsThisMonth } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thisMonthStart);

    // Requests previous month
    const { count: requestsPrevMonth } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', prevMonthStart)
      .lte('created_at', prevMonthEnd);

    // Today's requests
    const { count: todayRequests } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart);

    // Pending requests (status = draft)
    const { count: pendingRequests } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'draft');

    return res.json({
      total_requests: totalRequests || 0,
      requests_this_month: requestsThisMonth || 0,
      requests_prev_month: requestsPrevMonth || 0,
      today_requests: todayRequests || 0,
      pending_requests: pendingRequests || 0,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/dashboard/weekly - Requests per day for last 7 days
router.get('/weekly', authenticate, async (req, res) => {
  try {
    const days = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const dayDate = new Date(now);
      dayDate.setDate(dayDate.getDate() - i);
      const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).toISOString();
      const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59).toISOString();

      const { count } = await supabaseAdmin
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

      days.push({
        date: dayStart.split('T')[0],
        day: dayDate.toLocaleDateString('en-US', { weekday: 'short' }),
        count: count || 0,
      });
    }

    return res.json({ weekly: days });
  } catch (err) {
    console.error('Dashboard weekly error:', err);
    return res.status(500).json({ error: 'Failed to fetch weekly data' });
  }
});

// GET /api/dashboard/hourly - Requests per hour for today
router.get('/hourly', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const hours = [];

    for (let h = 0; h < 24; h++) {
      const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).toISOString();
      const hourEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 59, 59).toISOString();

      const { count } = await supabaseAdmin
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', hourStart)
        .lte('created_at', hourEnd);

      hours.push({
        hour: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        count: count || 0,
      });
    }

    return res.json({ hourly: hours });
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
