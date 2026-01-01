import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { config } from 'dotenv';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { assetsRouter } from './routes/assets';
import { configurePassport } from './auth/passport';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'asaps-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  },
}) as any);

// Passport initialization
configurePassport();
app.use(passport.initialize() as any);
app.use(passport.session() as any);

// Health check
app.get('/health', (req: any, res: any) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/assets', assetsRouter);

// Error handling middleware
app.use((err: Error, req: any, res: any, next: any) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[ASAPS Web Service] Running on port ${PORT}`);
  console.log(`[ASAPS Web Service] Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
