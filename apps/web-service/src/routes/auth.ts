import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import { prisma } from '../auth/passport';

const router = Router();

// Authentication middleware
export function requireAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

// Register with email/password
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
    });

    // Log in the user
    req.login(user, (err: Error) => {
      if (err) {
        return res.status(500).json({ error: 'Login failed' });
      }
      res.json({ user });
    });
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login with email/password
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err: Error, user: any, info: any) => {
    if (err) {
      return res.status(500).json({ error: 'Login failed' });
    }
    if (!user) {
      return res.status(401).json({ error: info?.message || 'Invalid credentials' });
    }

    req.login(user, (err: Error) => {
      if (err) {
        return res.status(500).json({ error: 'Login failed' });
      }
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      });
    });
  })(req, res, next);
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err: Error) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}));

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_failed`,
  }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/`);
  }
);

// GitHub OAuth
router.get('/github', passport.authenticate('github', {
  scope: ['user:email'],
}));

router.get('/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=github_failed`,
  }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/`);
  }
);

export { router as authRouter };
