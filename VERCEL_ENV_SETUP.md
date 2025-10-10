# Vercel Environment Variables Setup

## Problem
The app is failing with "Failed to fetch" because Supabase environment variables are not configured in Vercel.

## Solution

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to: https://vercel.com/dashboard
2. Select your project: **pokemon-draft-simulator**
3. Click **Settings** → **Environment Variables**
4. Add the following variables:

#### Variable 1
- **Name:** `NEXT_PUBLIC_SUPABASE_URL`
- **Value:** `https://dwqlxyeefzcclqdzteez.supabase.co`
- **Environments:** Check all (Production, Preview, Development)

#### Variable 2
- **Name:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3cWx4eWVlZnpjY2xxZHp0ZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTYxMjgsImV4cCI6MjA3NDczMjEyOH0.gHYrpMNE04JChwgLLeqplb1Y13o6l3B-nv1WINJSFUY`
- **Environments:** Check all (Production, Preview, Development)

5. Click **Save**
6. Go to **Deployments** tab
7. Click the **...** menu on the latest deployment
8. Click **Redeploy** (make sure "Use existing build cache" is **UNCHECKED**)

### Option 2: Via Vercel CLI

```bash
cd "C:\Users\msidh\Documents\Projects\Pokemon Draft\pokemon-draft"

# Link to Vercel project
vercel link

# Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Paste: https://dwqlxyeefzcclqdzteez.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Paste: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3cWx4eWVlZnpjY2xxZHp0ZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNTYxMjgsImV4cCI6MjA3NDczMjEyOH0.gHYrpMNE04JChwgLLeqplb1Y13o6l3B-nv1WINJSFUY

# Repeat for preview and development if needed

# Redeploy
vercel --prod
```

## Verification

After redeploying, the browser console should show:
```javascript
[Supabase Config] {
  hasUrl: true,
  hasKey: true,
  urlPrefix: "https://dwqlxyeefzcclqdzteez",
  urlLength: 43
}
```

Instead of the current error showing a malformed URL.

## Important Notes

- **NEXT_PUBLIC_** prefix is required for environment variables to be available in the browser
- Environment variables must be set **before** the build
- Always **redeploy without cache** after adding environment variables
- The values are embedded at build time, not runtime
