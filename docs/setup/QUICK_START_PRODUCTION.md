# Quick Start - Production Deployment

## ⚡ 5-Minute Production Setup

### Step 1: Database Security (2 min)
```bash
# Go to Supabase Dashboard → SQL Editor
# Copy and run: supabase-rls-policies.sql
```

### Step 2: Environment Variables (1 min)
```bash
# Add to your hosting platform (Vercel/Netlify)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Optional: Error tracking
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

### Step 3: Build & Deploy (2 min)
```bash
npm run build:formats  # Build format packs
npm run build          # Test build locally
vercel --prod          # Deploy to Vercel
```

## 🔐 Critical Security Checklist

Before going live:
- [ ] Apply RLS policies from `supabase-rls-policies.sql`
- [ ] Enable email auth in Supabase Dashboard
- [ ] Verify environment variables are set
- [ ] Test auth flow (sign up, login, logout)
- [ ] Confirm real-time subscriptions work

## 🧪 Quick Test

After deployment:
1. Visit `/auth/register` - create account
2. Visit `/create-draft` - create a draft
3. Open in incognito - join the draft
4. Test snake/auction drafts
5. Verify real-time updates work

## 📊 What's Already Working

✅ Snake draft with turn progression
✅ Auction draft with real-time bidding
✅ Wishlist & auto-pick system
✅ Team budget tracking
✅ Pokemon legality validation
✅ Spectator mode
✅ Draft analytics
✅ Error boundaries
✅ TypeScript build (passes)

## ⚠️ Known Issues

- ESLint warnings (cosmetic, not blocking)
- Mobile UI needs refinement (functional but not optimized)
- No tests yet (add Vitest tests)

## 🆘 Troubleshooting

### Build Fails
```bash
rm -rf .next node_modules
npm install
npm run build
```

### Auth Not Working
1. Check Supabase → Authentication → Providers
2. Enable Email provider
3. Verify environment variables
4. Check redirect URLs

### Real-time Not Working
1. Supabase → Database → Replication
2. Verify tables are enabled for real-time
3. Check browser console for errors

## 📚 Full Documentation

- Detailed deployment: [DEPLOYMENT.md](DEPLOYMENT.md)
- Full task list: [TODO.md](pokemon-draft/TODO.md)
- Work summary: [WORK_COMPLETED.md](WORK_COMPLETED.md)

## 🚀 Deploy Commands

### Vercel
```bash
vercel --prod
```

### Netlify
```bash
netlify deploy --prod
```

### Self-Hosted
```bash
npm run build
npm start
```

## ✅ Post-Deployment

1. Monitor Sentry for errors (if configured)
2. Check Supabase usage dashboard
3. Test on mobile devices
4. Share with beta testers
5. Gather feedback

---

**Time to Production**: ~5 minutes
**Prerequisites**: Supabase project, hosting account
**Support**: See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed help
