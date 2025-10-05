# 🚀 Production Deployment Checklist

Quick reference for deploying Pokemon Draft to production.

## ⏱️ Total Time: 1-2 hours

---

## ✅ Pre-Deployment (30 min)

### 1. Secure Database
- [ ] Backup Supabase database
- [ ] Open Supabase SQL Editor
- [ ] Run `database/migrations/APPLY_SECURITY.sql`
- [ ] Verify policies:
  ```sql
  SELECT tablename, COUNT(*) FROM pg_policies
  WHERE schemaname = 'public' GROUP BY tablename;
  ```
- [ ] Test guest user can create draft
- [ ] Test guest user can join draft
- [ ] Test guest user CANNOT access other private drafts

**See:** `SECURITY_QUICKSTART.md` Step 1

---

## 🔍 Error Tracking (15 min)

### 2. Install Sentry
```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

- [ ] Create Sentry account
- [ ] Run wizard (accept defaults)
- [ ] Add `NEXT_PUBLIC_SENTRY_DSN` to `.env.local`
- [ ] Add `NEXT_PUBLIC_SENTRY_DSN` to Vercel env vars
- [ ] Test with: `throw new Error('Test')`
- [ ] Verify error appears in Sentry dashboard
- [ ] Remove test error

**See:** `SECURITY_QUICKSTART.md` Step 2

---

## 🛡️ Rate Limiting (10 min)

### 3. Add Middleware
Create `middleware.ts` in project root:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const rateLimitMap = new Map<string, number[]>()

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/drafts') &&
      request.method === 'POST') {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const timestamps = rateLimitMap.get(ip) || []
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

- [ ] Create `middleware.ts`
- [ ] Copy code above
- [ ] Test rate limit works
- [ ] Commit and deploy

**See:** `SECURITY_QUICKSTART.md` Step 3

---

## 🔒 Security Headers (5 min)

### 4. Configure Headers
Edit `next.config.js`:

```javascript
const nextConfig = {
  // ... existing config
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}
```

- [ ] Edit `next.config.js`
- [ ] Add headers configuration
- [ ] Test locally
- [ ] Deploy
- [ ] Verify headers: `curl -I https://yourdomain.com`

**See:** `SECURITY_QUICKSTART.md` Step 1 (Quick Wins)

---

## 🧪 Testing (30 min)

### 5. Verify Everything Works

#### Database Security
- [ ] Create draft as guest user
- [ ] Join draft as different guest
- [ ] Make picks/bids
- [ ] View as spectator
- [ ] Try accessing private draft (should fail)
- [ ] Try modifying other's team (should fail)

#### Error Tracking
- [ ] Check Sentry dashboard shows errors
- [ ] Test error boundary catches crashes
- [ ] Verify source maps work (if enabled)

#### Rate Limiting
- [ ] Try creating 6 drafts quickly (should block)
- [ ] Wait 1 hour, verify limit resets

#### Performance
- [ ] Test on mobile device
- [ ] Check page load times
- [ ] Verify virtualized grid works
- [ ] Test real-time updates

---

## 📊 Post-Deployment

### 6. Set Up Monitoring

- [ ] Configure uptime monitoring (UptimeRobot, Pingdom)
  - URL: Your production domain
  - Interval: 5 minutes
  - Alerts: Email/SMS

- [ ] Set Sentry alerts
  - New issue: Immediate notification
  - Error spike: >10 errors/minute

- [ ] Monitor first 24 hours closely
  - Check error rates
  - Review performance
  - Monitor database load

---

## 🔐 Environment Variables Checklist

### Required in Production

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Optional
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

- [ ] All vars set in Vercel/hosting platform
- [ ] No secrets in git
- [ ] `.env.local` in `.gitignore`
- [ ] Test env vars load correctly

---

## ⚠️ Common Issues

### "Access denied" after RLS migration
**Fix:** Verify guest IDs start with `guest-`, check policies include `LIKE 'guest-%'`

### Rate limit not working
**Fix:** Check middleware.ts is in project root, verify it's running on API routes

### Sentry not tracking errors
**Fix:** Check DSN is correct, verify Sentry is initialized in `_app.tsx` or `app/layout.tsx`

### Security headers not appearing
**Fix:** Check next.config.js syntax, redeploy, clear cache

---

## 📞 Emergency Contacts

### Rollback Database Security
```sql
-- If security migration causes issues, run:
DROP POLICY IF EXISTS "View accessible drafts" ON drafts;
-- ... (drop all new policies)
CREATE POLICY "Allow all operations on drafts" ON drafts FOR ALL USING (true);
-- ... (restore permissive policies from supabase-schema.sql)
```

### Disable Rate Limiting
```bash
# Delete or rename middleware.ts
mv middleware.ts middleware.ts.disabled
# Redeploy
```

### Disable Sentry
```bash
# Remove from package.json and reinstall
npm uninstall @sentry/nextjs
# Remove Sentry config from app
```

---

## ✅ Final Verification

Before announcing launch:

- [ ] Database secured (RLS policies active)
- [ ] Error tracking working (test error appears in Sentry)
- [ ] Rate limiting active (can't create >5 drafts/hour)
- [ ] Security headers present (verified with curl)
- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] Mobile experience tested
- [ ] Real-time features working
- [ ] Backup plan ready
- [ ] Monitoring configured
- [ ] Team knows how to access logs

---

## 🎉 Launch!

Once all boxes are checked:
1. Make announcement
2. Monitor closely for first 24 hours
3. Respond to any issues quickly
4. Gather user feedback
5. Plan next iteration

---

## 📚 Reference Documents

- `SECURITY_QUICKSTART.md` - Detailed security guide
- `SECURITY.md` - Comprehensive security docs
- `TODO.md` - Project status and roadmap
- `SESSION_SUMMARY.md` - Recent changes summary

---

**Last updated:** 2025

**Estimated total time:** 1-2 hours

**Priority:** Complete before any production users
