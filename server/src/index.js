import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import requestRoutes from './routes/requests.js';
import emailRoutes from './routes/emails.js';
import templateRoutes from './routes/templates.js';
import replyRoutes from './routes/reply.js';
import userRoutes from './routes/users.js';
import pricingRoutes from './routes/pricing.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';
import attachmentRoutes from './routes/attachments.js';
import { startPolling } from './services/email/poller.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind inline styles
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://*.supabase.co'],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// CORS allowlist. ALLOWED_ORIGINS is a comma-separated list of origins
// (e.g. "https://linkworks-crm.vercel.app,https://linkworks.netlify.app").
// Leaving it unset in local dev falls back to the common Vite + local API hosts.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server / same-origin (no Origin header) and allowlist hits.
      if (!origin || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limit auth endpoints to slow brute-force attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/reply', replyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/attachments', attachmentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Process-level safety nets. Without these, an async error anywhere
// (most commonly the IMAP socket timing out) crashes the Node process.
// We log and keep running - the next poll cycle reconnects.
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err?.message || err);
});

// Only start server when running directly (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Linkworks CRM server running on port ${PORT}`);

    if (process.env.EMAIL_POLLING_ENABLED === 'true') {
      startPolling();
    } else {
      console.log('Email polling disabled (set EMAIL_POLLING_ENABLED=true to enable)');
    }
  });
}

export default app;
