# Deployment Guide - Pokemon Draft League

This guide covers deploying the Pokemon Draft League application to production.

## Prerequisites

Before deploying, ensure you have:

1. ✅ A Supabase project set up
2. ✅ (Optional) A Sentry account for error tracking
3. ✅ A hosting platform account (Vercel, Netlify, or similar)
4. ✅ Node.js 18+ installed locally

## Step 1: Database Setup

### 1.1 Run the Schema Migration

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the schema from `supabase-schema.sql`

### 1.2 Apply Secure RLS Policies

**CRITICAL:** The default schema has permissive "allow all" policies for development.

1. Open `supabase-rls-policies.sql`
2. Run this script in your Supabase SQL Editor to replace the permissive policies
3. Verify the policies are active:
   ```sql
   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
   ```

### 1.3 Enable Real-time Subscriptions

Ensure real-time is enabled for all tables:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE picks;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE pokemon_tiers;
ALTER PUBLICATION supabase_realtime ADD TABLE auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE wishlist_items;
```

### 1.4 Set Up Authentication

1. In Supabase Dashboard → Authentication → Providers
2. Enable Email authentication
3. (Optional) Enable OAuth providers:
   - Google OAuth
   - GitHub OAuth
4. Configure email templates for:
   - Confirmation emails
   - Password reset emails

## Step 2: Environment Variables

### 2.1 Required Variables

Create a `.env.production` file with:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Sentry (Optional but Recommended)
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=your-sentry-project
SENTRY_AUTH_TOKEN=your-sentry-auth-token

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production
```

### 2.2 Getting Supabase Keys

1. Go to Supabase Dashboard → Project Settings → API
2. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2.3 Setting Up Sentry (Optional)

1. Create account at [sentry.io](https://sentry.io)
2. Create a new Next.js project
3. Copy the DSN → `NEXT_PUBLIC_SENTRY_DSN`
4. Generate auth token → `SENTRY_AUTH_TOKEN`

## Step 3: Build Format Packs

Before deploying, compile the format packs:

```bash
npm run build:formats
```

This generates optimized format rules in `public/formats/packs/`.

## Step 4: Deploy to Vercel (Recommended)

### 4.1 Install Vercel CLI

```bash
npm i -g vercel
```

### 4.2 Deploy

```bash
# First deployment
vercel

# Production deployment
vercel --prod
```

### 4.3 Configure Environment Variables in Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add all variables from `.env.production`
3. Redeploy to apply changes

### 4.4 Configure Domains

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

## Step 5: Deploy to Other Platforms

### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod
```

### Self-Hosted (Docker)

```bash
# Build the Docker image
docker build -t pokemon-draft .

# Run the container
docker run -p 3000:3000 --env-file .env.production pokemon-draft
```

## Step 6: Post-Deployment Checklist

### 6.1 Security Verification

- [ ] Verify RLS policies are active in Supabase
- [ ] Test authentication flows (sign up, login, password reset)
- [ ] Verify OAuth providers work correctly
- [ ] Check that unauthorized users cannot access protected routes
- [ ] Test rate limiting (if implemented)

### 6.2 Functionality Testing

- [ ] Create a draft room
- [ ] Join a draft as multiple users
- [ ] Test snake draft functionality
- [ ] Test auction draft functionality
- [ ] Verify real-time updates work
- [ ] Test wishlist functionality
- [ ] Verify auto-pick works correctly
- [ ] Test spectator mode

### 6.3 Performance Verification

- [ ] Run Lighthouse audit (target: 90+ score)
- [ ] Check bundle size (use `npm run build` to analyze)
- [ ] Verify images are optimized
- [ ] Test on mobile devices
- [ ] Check page load times

### 6.4 Monitoring Setup

- [ ] Verify Sentry is receiving errors (test with a deliberate error)
- [ ] Set up uptime monitoring (e.g., UptimeRobot)
- [ ] Configure Sentry alerts for critical errors
- [ ] Set up performance monitoring

## Step 7: Ongoing Maintenance

### Database Backups

1. In Supabase Dashboard → Database → Backups
2. Enable automatic daily backups
3. Set retention period (recommended: 30 days)

### Monitoring

- Check Sentry dashboard weekly for new errors
- Monitor Supabase usage to stay within plan limits
- Review real-time subscription usage

### Updates

```bash
# Update dependencies monthly
npm update

# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

## Troubleshooting

### Real-time Not Working

1. Check Supabase real-time inspector
2. Verify real-time is enabled for tables
3. Check browser console for connection errors

### Authentication Issues

1. Verify environment variables are set correctly
2. Check Supabase auth settings
3. Verify email templates are configured
4. Check redirect URLs are whitelisted in Supabase

### Build Failures

1. Clear Next.js cache: `rm -rf .next`
2. Clear node modules: `rm -rf node_modules && npm install`
3. Check TypeScript errors: `npm run build`

### Performance Issues

1. Enable caching in your hosting platform
2. Optimize images using Next.js Image component
3. Consider adding CDN (Cloudflare, etc.)
4. Review database query performance in Supabase

## Support

For issues and questions:
- GitHub Issues: [your-repo/issues]
- Documentation: [your-docs-url]
- Email: [your-support-email]

## Rollback Plan

If deployment fails:

1. Revert to previous Vercel deployment:
   ```bash
   vercel rollback
   ```

2. Or manually revert database changes:
   - Restore from Supabase backup
   - Revert RLS policy changes

3. Update status page and notify users if needed
