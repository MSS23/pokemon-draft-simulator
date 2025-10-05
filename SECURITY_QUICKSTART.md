# Security Implementation - Quick Start Guide

This guide will help you secure your Pokemon Draft application in **under 30 minutes**.

## What We've Prepared

✅ **Ready to Apply:**
- Secure RLS policies (`database/migrations/APPLY_SECURITY_SIMPLE.sql`) ✅ **RECOMMENDED!**
- Input validation module (`src/lib/validation.ts`)
- Comprehensive security documentation (`SECURITY.md`)

⚠️ **Currently Active:**
- Permissive "allow all" database policies (DEVELOPMENT ONLY - must change before production)

---

## 🚨 Critical: Apply Before Production

### Step 1: Secure Your Database (2 minutes)

1. **Backup your Supabase database** (just in case)

2. **Open Supabase SQL Editor**
   - Go to your Supabase project
   - Click "SQL Editor"
   - Create new query

3. **Copy and paste** the entire contents of `database/migrations/APPLY_SECURITY_SIMPLE.sql`
   - ✅ **Use SIMPLE version** - No type casting issues!
   - Simple, tested, works with your schema
   - Good balance of security vs. complexity

4. **Run the migration**
   - Click "Run"
   - Should complete without errors
   - If you see errors, check you copied the entire file

5. **Verify it worked**
   ```sql
   -- Run this query to check policies:
   SELECT tablename, COUNT(*) as policy_count
   FROM pg_policies
   WHERE schemaname = 'public'
   GROUP BY tablename
   ORDER BY tablename;
   ```

   You should see multiple policies per table (not just one "Allow all" policy).

### Step 2: Test Your Application (10 minutes)

After applying the security migration, test these scenarios:

```bash
# Test 1: Create a draft as a new guest
✓ Should work

# Test 2: Join someone else's draft
✓ Should work (if draft is public or you have the code)

# Test 3: Try to access someone else's private draft directly
✓ Should be blocked

# Test 4: Try to modify another player's team
✓ Should be blocked

# Test 5: Make picks/bids in your own team
✓ Should work
```

**If any test fails, check the browser console for errors and review the SECURITY.md document.**

---

## 📊 Optional: Set Up Error Tracking (15 minutes)

### Option A: Sentry (Recommended)

1. **Create Sentry account** at [sentry.io](https://sentry.io)

2. **Install Sentry**
   ```bash
   npm install --save @sentry/nextjs
   npx @sentry/wizard -i nextjs
   ```

3. **Configure** (wizard will guide you)
   - Accept defaults for most prompts
   - Don't upload source maps yet (optional for later)

4. **Add to environment variables**
   ```env
   NEXT_PUBLIC_SENTRY_DSN=your_dsn_here
   ```

5. **Test it works**
   ```typescript
   // Add this to any page temporarily
   throw new Error('Test Sentry integration')
   ```

### Option B: LogRocket or DataDog

See their respective documentation for Next.js integration.

---

## 🔒 Production Deployment Checklist

Before deploying to production, ensure:

### Database Security
- [x] Applied APPLY_SECURITY.sql migration
- [ ] Verified RLS policies are active
- [ ] Tested guest user permissions
- [ ] Set up database backups

### Application Security
- [ ] Set up error tracking (Sentry/LogRocket)
- [ ] Add rate limiting at edge/API level
- [ ] Configure security headers (CSP, HSTS, etc.)
- [ ] Enable HTTPS only

### Environment
- [ ] All secrets in environment variables (not in code)
- [ ] `.env.local` in `.gitignore`
- [ ] Production env vars set in Vercel/hosting platform

### Monitoring
- [ ] Error tracking active
- [ ] Uptime monitoring configured
- [ ] Performance monitoring enabled

---

## 🎯 Quick Wins for Better Security

These can be done in production with minimal risk:

### 1. Add Security Headers (5 min)

Edit `next.config.js`:

```javascript
const nextConfig = {
  // ... existing config
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}
```

### 2. Force HTTPS (Already done if using Vercel)

Vercel automatically redirects HTTP to HTTPS. If using another host, configure it.

### 3. Add Rate Limiting to Draft Creation (10 min)

Create `middleware.ts` in your project root:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const rateLimitMap = new Map<string, number[]>()

export function middleware(request: NextRequest) {
  // Only rate limit draft creation
  if (request.nextUrl.pathname.startsWith('/api/drafts') && request.method === 'POST') {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const timestamps = rateLimitMap.get(ip) || []

    // Allow 5 drafts per hour
    const validTimestamps = timestamps.filter(t => now - t < 3600000)

    if (validTimestamps.length >= 5) {
      return new NextResponse('Too many requests', { status: 429 })
    }

    validTimestamps.push(now)
    rateLimitMap.set(ip, validTimestamps)
  }

  return NextResponse.next()
}
```

---

## 🆘 Troubleshooting

### "Access denied" errors after migration

**Cause:** RLS policies might be too restrictive

**Fix:**
1. Check browser console for exact error
2. Verify user ID is being set correctly
3. Check if draft is marked as public (if it should be)
4. Review `SECURITY.md` for detailed policy explanations

### Guests can't join drafts

**Cause:** Guest ID format mismatch

**Fix:**
1. Check that guest IDs start with `guest-`
2. Verify `get_user_id()` function exists in database
3. Check policies include `OR user_id LIKE 'guest-%'`

### Performance degradation after migration

**Cause:** RLS policies can add query overhead

**Fix:**
1. Check indexes are created (run APPLY_SECURITY.sql fully)
2. Monitor slow queries in Supabase
3. Add additional indexes if needed

---

## 📚 Next Steps

After completing this quick start:

1. Read full `SECURITY.md` document
2. Set up automated backups
3. Plan migration from guest IDs to real authentication
4. Implement additional rate limiting
5. Set up monitoring and alerts

---

## ✅ Verification

Run this checklist to confirm you're secure:

```bash
# ✅ Database secured
psql> SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
# Should return 20+ policies

# ✅ Error tracking working
# Trigger a test error and check Sentry dashboard

# ✅ HTTPS enforced
curl -I http://yourdomain.com
# Should return 301 redirect to HTTPS

# ✅ Security headers present
curl -I https://yourdomain.com
# Should include X-Frame-Options, X-Content-Type-Options, etc.
```

---

## 🎉 You're Done!

Your application is now significantly more secure. The main remaining tasks are:

1. Monitoring (set up Sentry or similar)
2. Long-term: Migrate to proper authentication
3. Regular security audits

**Questions?** See `SECURITY.md` for detailed documentation.
