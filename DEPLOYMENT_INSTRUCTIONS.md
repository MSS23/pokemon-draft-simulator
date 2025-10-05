# Deployment Instructions

Follow these steps to deploy your Pokémon Draft League to production.

## ✅ Pre-Deployment Checklist

### 1. Verify Supabase Environment Variables (Already Set ✅)

Current variables in Vercel:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`

### 2. Set Up Sentry (Error Tracking)

#### Option A: Use Sentry (Recommended)

1. **Create Sentry Account** (if you don't have one)
   - Go to [https://sentry.io/signup/](https://sentry.io/signup/)
   - Sign up with email or GitHub
   - Free tier includes 5K errors/month

2. **Create New Project**
   - Click "Create Project"
   - Platform: **Next.js**
   - Alert frequency: **On every new issue**
   - Project name: `pokemon-draft`

3. **Get Your DSN**
   - After project creation, you'll see your DSN
   - Format: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`
   - Copy this value

4. **Add to Vercel**
   ```bash
   cd "c:\Users\msidh\Documents\Projects\Pokemon Draft\pokemon-draft"

   # Add Sentry DSN
   vercel env add NEXT_PUBLIC_SENTRY_DSN
   # When prompted, paste your DSN
   # Select: Production, Preview, Development

   # Add Sentry Organization (shown in Sentry settings)
   vercel env add SENTRY_ORG
   # Paste your org slug (e.g., "my-organization")

   # Add Sentry Project
   vercel env add SENTRY_PROJECT
   # Enter: pokemon-draft
   ```

#### Option B: Deploy Without Sentry (Skip Error Tracking)

If you want to deploy without Sentry for now:
- The app will work fine without it
- Errors will only show in console
- You can add Sentry later without redeploying

**To skip Sentry**: Just don't set the environment variables. The app will detect this and skip Sentry initialization.

---

## 🗄️ Database Setup

### Verify RLS Migration (CRITICAL)

1. **Open Supabase Dashboard**
   - Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your project

2. **Go to SQL Editor**
   - Click "SQL Editor" in sidebar
   - Click "New query"

3. **Verify RLS Policies Are Active**

   Run this query to check:
   ```sql
   SELECT schemaname, tablename, policyname, permissive, cmd
   FROM pg_policies
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
   ```

4. **Expected Output**

   You should see policies for these tables:
   - `drafts` (4 policies)
   - `teams` (4 policies)
   - `participants` (4 policies)
   - `picks` (3 policies)
   - `auctions` (4 policies)
   - `bid_history` (2 policies)

5. **If No Policies Found**

   Run the RLS migration:
   ```sql
   -- Copy contents from:
   -- pokemon-draft/database/migrations/006_guest_compatible_rls.sql
   -- And paste here, then click "Run"
   ```

---

## 🚀 Deploy to Vercel

### Push Latest Code

```bash
cd "c:\Users\msidh\Documents\Projects\Pokemon Draft\pokemon-draft"

# Push to GitHub (if you have a remote)
git push origin main

# Or deploy directly to Vercel
vercel --prod
```

### Deployment Process

When you run `vercel --prod`:

1. **Build Phase** (~2-3 minutes)
   - Installing dependencies
   - Generating service worker
   - Building Next.js app
   - Optimizing bundles

2. **Expected Output**
   ```
   ✓ Compiled successfully
   ✓ Linting and checking validity of types
   ✓ Collecting page data
   ✓ Generating static pages
   ✓ Finalizing page optimization
   ```

3. **Deployment Complete**
   ```
   ✓ Deployed to production
   🔍 Inspect: https://vercel.com/...
   ✨ Visit: https://pokemon-draft.vercel.app
   ```

---

## ✅ Post-Deployment Verification

### 1. Smoke Test (5 minutes)

Visit your deployed URL and test:

#### Test 1: Create Draft
- [ ] Click "Create Draft"
- [ ] Fill in draft name
- [ ] Select format (Snake or Auction)
- [ ] Click "Create Draft"
- [ ] ✅ Should create successfully and redirect

#### Test 2: Join Draft
- [ ] Copy the room code
- [ ] Open in incognito/private window
- [ ] Click "Join Draft"
- [ ] Enter room code
- [ ] Enter your name
- [ ] ✅ Should join successfully

#### Test 3: Make a Pick
- [ ] Start the draft
- [ ] Search for a Pokémon (e.g., "Pikachu")
- [ ] Click to select
- [ ] ✅ Pick should appear in team roster
- [ ] ✅ Other window should see the pick

#### Test 4: PWA Installation
- [ ] Click install button in browser address bar
- [ ] ✅ App should install
- [ ] ✅ Open from Start Menu/Home Screen
- [ ] ✅ Should open in standalone window

#### Test 5: Offline Mode
- [ ] Open DevTools → Network
- [ ] Select "Offline"
- [ ] Navigate to different pages
- [ ] ✅ Cached pages should load
- [ ] ✅ Pokémon sprites should show (if previously loaded)

### 2. Verify Sentry (If Configured)

1. **Trigger Test Error**
   - Go to your app
   - Open browser console
   - Run: `throw new Error("Test error for Sentry")`

2. **Check Sentry Dashboard**
   - Go to [https://sentry.io](https://sentry.io)
   - Click on your project
   - Click "Issues"
   - ✅ Should see "Test error for Sentry"

### 3. Check Performance

1. **Run Lighthouse Audit**
   - Open DevTools
   - Go to "Lighthouse" tab
   - Check: Performance, PWA, Best Practices
   - Click "Generate Report"

   **Expected Scores**:
   - Performance: 80-95 (depends on network)
   - PWA: 100 ✅
   - Best Practices: 90+ ✅
   - Accessibility: 85+

2. **Check Bundle Size**
   - Open Network tab
   - Refresh page
   - Check total transferred
   - ✅ Should be ~500KB or less (gzipped)

### 4. Test Rate Limiting

```bash
# Test with curl (optional)
# This should get rate limited after 100 requests

for i in {1..110}; do
  curl https://your-app.vercel.app/api/health
done

# After ~100 requests, you should see:
# {"error":"Rate limit exceeded","message":"Too many requests"}
```

---

## 🔍 Monitoring Setup

### Vercel Analytics

1. Go to your Vercel dashboard
2. Select your project
3. Click "Analytics" tab
4. Enable Analytics (free tier available)

**Monitors**:
- Page views
- Top pages
- Geographic distribution
- Real user metrics

### Sentry Monitoring

1. Go to [https://sentry.io](https://sentry.io)
2. Click your project
3. Set up alerts:
   - Click "Settings" → "Alerts"
   - Create alert: "Send me email when new issue occurs"

**What Sentry Tracks**:
- JavaScript errors
- Unhandled promise rejections
- Network errors
- Performance issues
- User flow before errors

### Supabase Monitoring

1. Go to Supabase dashboard
2. Click "Database" → "Query Performance"
3. Monitor:
   - Active connections
   - Slow queries
   - Database size

---

## 🐛 Common Issues & Solutions

### Issue 1: Build Fails with "Type Error"
**Solution**:
```bash
# Clean build cache
rm -rf .next
npm run build
```

### Issue 2: Environment Variables Not Working
**Solution**:
```bash
# Re-pull environment variables
vercel env pull .env.local

# Redeploy
vercel --prod
```

### Issue 3: RLS Blocking Queries
**Symptoms**: "Row level security policy violation"

**Solution**:
1. Check RLS policies are applied
2. Verify user is authenticated (or guest ID is valid)
3. Check policy conditions match your use case

### Issue 4: Service Worker Not Updating
**Solution**:
```javascript
// In browser console:
navigator.serviceWorker.getRegistrations()
  .then(regs => regs.forEach(reg => reg.unregister()))
  .then(() => location.reload())
```

### Issue 5: PWA Not Installable
**Checklist**:
- [ ] HTTPS enabled (Vercel does this automatically)
- [ ] manifest.json accessible at /manifest.json
- [ ] Service worker registered
- [ ] Icons exist (need to create icon-192x192.png and icon-512x512.png)

---

## 📱 Creating PWA Icons (Optional but Recommended)

### Option 1: Use Online Generator

1. Go to [https://www.pwabuilder.com/imageGenerator](https://www.pwabuilder.com/imageGenerator)
2. Upload your logo/icon
3. Download generated icons
4. Place in `public/`:
   - `icon-192x192.png`
   - `icon-512x512.png`

### Option 2: Create Manually

**Requirements**:
- 192x192px PNG
- 512x512px PNG
- Transparent background
- Centered subject with 20% padding

**Placeholder Command**:
```bash
# You can deploy without icons for now
# The app will work, just won't have custom icon when installed
```

---

## 🎯 Quick Deployment Commands

```bash
# Full deployment workflow
cd "c:\Users\msidh\Documents\Projects\Pokemon Draft\pokemon-draft"

# 1. Ensure latest code is committed
git status

# 2. Push to GitHub (if connected)
git push origin main

# 3. Deploy to Vercel
vercel --prod

# 4. (Optional) Test locally first
vercel dev
```

---

## ✅ Deployment Checklist

- [x] Supabase environment variables set
- [ ] Sentry project created (optional)
- [ ] Sentry environment variables added (optional)
- [ ] RLS policies verified in Supabase
- [ ] Code pushed to repository
- [ ] Deployed to Vercel
- [ ] Smoke test completed
- [ ] PWA installation tested
- [ ] Offline mode verified
- [ ] Sentry receiving errors (if configured)
- [ ] Monitoring dashboards bookmarked

---

## 🎉 You're Live!

Once deployed, your app will be available at:
- **Production**: `https://pokemon-draft.vercel.app` (or your custom domain)
- **Sentry Dashboard**: `https://sentry.io/organizations/YOUR_ORG/projects/pokemon-draft/`
- **Vercel Dashboard**: `https://vercel.com/YOUR_USERNAME/pokemon-draft`

### Share Your App

Users can:
1. Visit your URL
2. Install as PWA (works offline!)
3. Create drafts without authentication
4. Share room codes to invite friends

---

## 📞 Need Help?

- **Vercel Issues**: [https://vercel.com/support](https://vercel.com/support)
- **Sentry Issues**: [https://docs.sentry.io/](https://docs.sentry.io/)
- **Supabase Issues**: [https://supabase.com/docs](https://supabase.com/docs)
- **App Issues**: Check [docs/setup/TROUBLESHOOTING.md](docs/setup/TROUBLESHOOTING.md)

---

**Ready to deploy? Run `vercel --prod` and you're live! 🚀**
