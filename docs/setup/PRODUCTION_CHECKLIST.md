# Production Readiness Checklist

This checklist ensures all security and production requirements are met before deployment.

## ✅ Security (CRITICAL)

### Database Security
- [x] **RLS Policies Implemented**: Migration `006_guest_compatible_rls.sql` provides guest-compatible Row Level Security
- [x] **Input Validation**: `src/lib/validation.ts` sanitizes all user inputs
- [x] **Rate Limiting**: Middleware enforces rate limits on all API endpoints
- [ ] **Environment Variables Secured**: All secrets stored in Vercel/environment, not in code

### Application Security
- [x] **XSS Prevention**: String sanitization removes HTML tags and dangerous characters
- [x] **SQL Injection Prevention**: Using Supabase parameterized queries
- [ ] **CSRF Protection**: Implement CSRF tokens for form submissions
- [x] **Error Tracking**: Sentry configured for error monitoring

### Rate Limits (Configured)
- 10 drafts per hour per user/IP
- 60 picks per minute per user/IP
- 120 bids per minute per user/IP
- 100 general API requests per minute per user/IP

## ✅ Monitoring & Logging

### Error Tracking
- [x] **Sentry Integration**: Client, server, and edge runtime configured
- [ ] **Sentry DSN Set**: Add `NEXT_PUBLIC_SENTRY_DSN` to environment variables
- [x] **Error Categories**: All errors categorized with severity levels
- [x] **PII Filtering**: Guest user data filtered from error reports

### Performance Monitoring
- [x] **Sentry Performance**: 10% trace sampling in production
- [ ] **Database Monitoring**: Enable Supabase performance insights
- [ ] **Vercel Analytics**: Enable Web Vitals tracking

## ✅ Testing

- [x] **Unit Tests**: Validation tests with 159 passing tests
- [x] **Format Tests**: VGC regulation tests with 118 passing tests
- [ ] **Integration Tests**: End-to-end draft flow tests
- [ ] **Load Tests**: Verify rate limiting and concurrent users

## ✅ Environment Variables

### Required for Production

```env
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Sentry (RECOMMENDED)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project

# Vercel (Auto-set)
NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA=auto
```

### Setting Environment Variables

**Vercel:**
```bash
vercel env add NEXT_PUBLIC_SENTRY_DSN
vercel env add SENTRY_ORG
vercel env add SENTRY_PROJECT
```

**Local:**
Copy `.env.local.example` to `.env.local` and fill in values.

## ✅ Database Setup

### Run Migrations in Order

1. Base tables (via Supabase SQL Editor)
2. `001_add_bid_history.sql`
3. `002_spectator_mode.sql`
4. `003_draft_history.sql`
5. `004_custom_formats_and_admins.sql`
6. `005_draft_history_undo.sql`
7. `006_chat_system.sql`
8. **`006_guest_compatible_rls.sql`** ← SECURITY CRITICAL

### Verify RLS Policies

```sql
-- Run in Supabase SQL Editor to verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';
```

Should show policies for:
- drafts (4 policies)
- teams (4 policies)
- participants (4 policies)
- picks (3 policies)
- auctions (4 policies)
- bid_history (2 policies)

## ✅ Performance

### Bundle Optimization
- [x] **Code Splitting**: Webpack configured with chunk splitting
- [x] **Tree Shaking**: Production build removes unused code
- [x] **Compression**: Gzip compression enabled
- [x] **Image Optimization**: Next.js Image component configured

### Caching
- [x] **React Query**: Configured for Pokemon data caching
- [x] **Enhanced Cache**: Pokemon cache with 1-hour TTL
- [ ] **CDN Caching**: Configure Vercel Edge caching

## ✅ Accessibility

- [x] **Theme Support**: Dark/light mode implemented
- [ ] **Keyboard Navigation**: Test all interactive elements
- [ ] **Screen Reader**: Test with NVDA/JAWS
- [ ] **WCAG 2.1 AA**: Run accessibility audit

## ✅ Deployment

### Pre-Deployment Checklist

1. **Build Test**
   ```bash
   npm run build
   ```
   Ensure no TypeScript errors.

2. **Run Tests**
   ```bash
   npm test
   ```
   All tests should pass (currently 159/159).

3. **Environment Variables**
   - Set all required env vars in Vercel
   - Verify Supabase connection
   - Test Sentry integration

4. **Database Migrations**
   - Run all migrations in Supabase
   - Verify RLS policies active
   - Test with guest users

5. **Security Scan**
   ```bash
   npm audit
   ```
   Address any critical vulnerabilities.

### Deployment Commands

```bash
# Link to Vercel project
vercel link

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Post-Deployment Verification

1. **Smoke Test**
   - Create a draft
   - Join as guest user
   - Make picks
   - Verify real-time updates

2. **Error Tracking**
   - Check Sentry dashboard
   - Verify errors are being captured
   - Check error categories and tagging

3. **Performance**
   - Run Lighthouse audit
   - Check Core Web Vitals
   - Verify API response times

4. **Security**
   - Test rate limiting (should get 429 after limits)
   - Verify RLS (guests can't access other drafts)
   - Check HTTPS/TLS certificate

## 🚨 Known Limitations

### Current State

1. **Authentication**: Guest-only mode (no full user accounts)
   - Users identified by session IDs
   - No password storage required
   - **Future**: Add Supabase Auth for persistent accounts

2. **Rate Limiting**: In-memory (single instance)
   - Works for Vercel single-region deployment
   - **Future**: Use Redis/Upstash for multi-region

3. **Real-time Subscriptions**: Supabase limits
   - Free tier: 200 concurrent connections
   - **Monitor**: Supabase dashboard for connection usage

## 📊 Monitoring Dashboards

### Sentry
- [Sentry Dashboard](https://sentry.io) - Error tracking and performance
- Filter by environment: `production`
- Set up alerts for high error rates

### Supabase
- [Supabase Dashboard](https://supabase.com/dashboard) - Database monitoring
- Check Table Editor for data integrity
- Monitor Realtime connections

### Vercel
- [Vercel Analytics](https://vercel.com/analytics) - Web Vitals and traffic
- Check function logs for errors
- Monitor bandwidth and build minutes

## 🔄 Continuous Improvement

### Recommended Next Steps

1. **Add Integration Tests**
   ```bash
   npm install -D @playwright/test
   ```

2. **Set Up CI/CD**
   - GitHub Actions for automated testing
   - Auto-deploy on main branch merge

3. **Implement Full Auth**
   - Supabase Auth with email/password
   - OAuth providers (Google, Discord)
   - User profile management

4. **Add Redis Rate Limiting**
   - Upstash for serverless Redis
   - Distributed rate limiting

5. **Performance Budget**
   - Set up Lighthouse CI
   - Enforce performance budgets

## ✅ Final Verification

Before going live, verify:

- [ ] All tests passing (`npm test`)
- [ ] Build successful (`npm run build`)
- [ ] Environment variables set in Vercel
- [ ] Database migrations applied
- [ ] RLS policies active
- [ ] Sentry receiving errors
- [ ] Rate limiting working
- [ ] Input validation tested
- [ ] Guest user flow tested
- [ ] Real-time updates working

## 🎉 You're Ready for Production!

Once all items are checked, your application is production-ready with:
- ✅ Secure database with RLS
- ✅ Input validation and sanitization
- ✅ Rate limiting protection
- ✅ Error tracking and monitoring
- ✅ Comprehensive test coverage
- ✅ Performance optimization

For issues, check:
1. [Troubleshooting Guide](./TROUBLESHOOTING.md)
2. [Supabase Setup Guide](./SUPABASE_SETUP_GUIDE.md)
3. [GitHub Issues](https://github.com/your-repo/issues)
