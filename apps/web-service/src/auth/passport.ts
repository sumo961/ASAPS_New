import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function configurePassport(): void {
  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
        },
      });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Local strategy (email/password)
  passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.passwordHash) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));

  // Google OAuth strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await prisma.user.findUnique({
            where: { googleId: profile.id },
          });

          if (!user) {
            // Check if user exists with same email
            const email = profile.emails?.[0]?.value;
            if (email) {
              user = await prisma.user.findUnique({
                where: { email: email.toLowerCase() },
              });

              if (user) {
                // Link Google account to existing user
                user = await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    googleId: profile.id,
                    avatarUrl: user.avatarUrl || profile.photos?.[0]?.value,
                    lastLoginAt: new Date(),
                  },
                });
              }
            }

            if (!user && email) {
              // Create new user
              user = await prisma.user.create({
                data: {
                  googleId: profile.id,
                  email: email.toLowerCase(),
                  name: profile.displayName,
                  avatarUrl: profile.photos?.[0]?.value,
                  lastLoginAt: new Date(),
                },
              });
            }
          } else {
            // Update last login
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            });
          }

          return done(null, user || false);
        } catch (error) {
          return done(error as Error);
        }
      }
    ));
  }

  // GitHub OAuth strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/github/callback`,
        scope: ['user:email'],
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          let user = await prisma.user.findUnique({
            where: { githubId: profile.id },
          });

          if (!user) {
            const email = profile.emails?.[0]?.value;
            if (email) {
              user = await prisma.user.findUnique({
                where: { email: email.toLowerCase() },
              });

              if (user) {
                user = await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    githubId: profile.id,
                    avatarUrl: user.avatarUrl || profile.photos?.[0]?.value,
                    lastLoginAt: new Date(),
                  },
                });
              }
            }

            if (!user && email) {
              user = await prisma.user.create({
                data: {
                  githubId: profile.id,
                  email: email.toLowerCase(),
                  name: profile.displayName || profile.username,
                  avatarUrl: profile.photos?.[0]?.value,
                  lastLoginAt: new Date(),
                },
              });
            }
          } else {
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    ));
  }
}

export { prisma };
