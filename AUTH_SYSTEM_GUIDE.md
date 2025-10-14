# Authentication System Guide

Your Pokemon Draft Simulator has a **complete authentication system** already built in! Here's how to use it.

## 🔐 Available Authentication Methods

### 1. Email & Password
- Traditional username/password authentication
- Email verification required for security
- Password reset functionality

### 2. OAuth Providers
- **Google Sign-In** - One-click authentication with Google account
- **GitHub Sign-In** - One-click authentication with GitHub account

---

## 📍 How to Access Sign Up & Sign In

### Method 1: Header Button (Recommended)
1. Go to https://pokemon-draft-simulator.vercel.app/
2. Click **"Sign In"** button in the top-right corner
3. A modal will pop up with the sign-in form
4. Click "Sign up" link at the bottom to switch to registration

### Method 2: Direct URLs
Access the forms directly via these URLs:

**Sign Up:**
```
https://pokemon-draft-simulator.vercel.app/auth/register
```

**Sign In:**
```
https://pokemon-draft-simulator.vercel.app/auth/login
```

**Password Reset:**
```
https://pokemon-draft-simulator.vercel.app/auth/reset-password
```

---

## 🎨 Sign Up Form Features

**Located at:** [`/auth/register`](https://pokemon-draft-simulator.vercel.app/auth/register)

**What's included:**
- ✅ Display Name field (optional - defaults to email username)
- ✅ Email field (required)
- ✅ Password field (minimum 6 characters)
- ✅ Show/hide password toggle
- ✅ Google OAuth button
- ✅ GitHub OAuth button
- ✅ Link to switch to Sign In
- ✅ Email verification flow
- ✅ User-friendly error messages

**Registration Flow:**
```
1. User enters email + password
2. Clicks "Create account"
3. Supabase creates user account
4. Verification email sent
5. User clicks link in email
6. Account activated!
7. User can now sign in
```

---

## 🔑 Sign In Form Features

**Located at:** [`/auth/login`](https://pokemon-draft-simulator.vercel.app/auth/login)

**What's included:**
- ✅ Email field
- ✅ Password field
- ✅ Show/hide password toggle
- ✅ Google OAuth button
- ✅ GitHub OAuth button
- ✅ "Forgot password?" link
- ✅ Link to switch to Sign Up
- ✅ Redirect to original page after login
- ✅ User-friendly error messages

**Sign In Flow:**
```
1. User enters email + password
2. Clicks "Sign in"
3. Supabase authenticates
4. User redirected to dashboard (or original page)
5. Session persists across page reloads
```

---

## 🎯 User Experience Features

### Smart Redirects
When a user tries to access a protected page:
```
1. User visits /dashboard (requires auth)
2. Redirected to /auth/login?redirectTo=/dashboard
3. User signs in
4. Automatically redirected back to /dashboard
```

### OAuth Flow
```
1. User clicks "Google" or "GitHub" button
2. Redirected to provider (Google/GitHub)
3. User authorizes the app
4. Redirected back to app
5. Account created/linked automatically
6. User signed in!
```

### Password Visibility Toggle
- Click the eye icon to show password
- Click again to hide password
- Improves usability without sacrificing security

### Error Handling
User-friendly error messages for common issues:
- "This email is already registered. Please sign in instead."
- "Invalid email or password. Please try again."
- "Please check your email and verify your account before signing in."
- "Password must be at least 6 characters long."

---

## 🔧 Technical Implementation

### Authentication Provider
**Supabase Auth** - Enterprise-grade authentication service
- Secure JWT tokens
- Session management
- Email verification
- Password hashing (bcrypt)
- OAuth integration

### Components Structure
```
src/
├── app/
│   └── auth/
│       ├── login/page.tsx          # Sign in page
│       ├── register/page.tsx       # Sign up page
│       ├── reset-password/page.tsx # Password reset
│       └── callback/route.ts       # OAuth callback handler
├── components/
│   ├── auth/
│   │   ├── AuthForm.tsx            # Reusable auth form (login/register)
│   │   └── AuthModal.tsx           # Sign in modal (header button)
│   └── layout/
│       └── Header.tsx              # Navigation with auth buttons
└── contexts/
    └── AuthContext.tsx             # Auth state management
```

### Auth Context
The `AuthContext` provides:
- `user` - Current user object (null if not signed in)
- `signIn(email, password)` - Sign in function
- `signUp(email, password, displayName)` - Sign up function
- `signOut()` - Sign out function
- `loading` - Authentication loading state

### Protected Routes
To protect a route, use the `useAuth` hook:

```typescript
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ProtectedPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login?redirectTo=/protected-page')
    }
  }, [user, loading, router])

  if (loading) return <div>Loading...</div>
  if (!user) return null

  return <div>Protected content!</div>
}
```

---

## 🎨 Design Features

### Responsive Design
- Works on desktop, tablet, and mobile
- Touch-friendly buttons and inputs
- Adaptive layouts

### Dark Mode Support
- All auth forms support dark mode
- Smooth transitions between themes
- Consistent with app design

### Accessibility
- Proper labels and ARIA attributes
- Keyboard navigation support
- Screen reader friendly
- Focus management

### Visual Polish
- Beautiful gradient backgrounds
- Smooth animations and transitions
- Loading states with spinners
- Icon indicators for input fields

---

## 🚀 Testing the Auth System

### Test Sign Up
1. Go to https://pokemon-draft-simulator.vercel.app/auth/register
2. Enter a valid email (use a real email to test verification)
3. Create a password (min 6 characters)
4. Click "Create account"
5. Check your email for verification link
6. Click the verification link
7. Return to app and sign in

### Test Sign In
1. Go to https://pokemon-draft-simulator.vercel.app/auth/login
2. Enter your registered email
3. Enter your password
4. Click "Sign in"
5. You should be redirected to dashboard
6. Check header shows your email

### Test OAuth
1. Go to login page
2. Click "Google" or "GitHub" button
3. Authorize in popup window
4. Should automatically create account and sign you in
5. Check header shows your email

### Test Sign Out
1. While signed in, click your email in header
2. Click "Sign Out" from dropdown
3. Should return to homepage
4. Header should show "Sign In" button again

---

## 🔒 Security Features

### Password Security
- Minimum 6 characters enforced
- Hashed with bcrypt (never stored in plaintext)
- Secure password reset flow

### Email Verification
- Prevents fake account creation
- Confirms user owns the email
- Required before full access

### Session Management
- Secure JWT tokens
- Automatic refresh
- Timeout after inactivity

### OAuth Security
- Industry-standard OAuth 2.0
- No password storage needed
- Secure third-party authentication

---

## 📋 Current Status

✅ **Fully Functional**
- Sign up form works
- Sign in form works
- Password reset works
- OAuth (Google/GitHub) works
- Email verification works
- Session persistence works
- Protected routes work

⚠️ **Optional Enhancements**
- Add "Remember me" checkbox
- Add two-factor authentication (2FA)
- Add social profile info sync
- Add account deletion
- Add change password flow

---

## 🎯 Quick Access

**For Users:**
- Sign Up: Click "Sign In" → Click "Sign up" link
- Sign In: Click "Sign In" button in header
- Sign Out: Click email dropdown → "Sign Out"

**For Developers:**
- Forms: `src/components/auth/AuthForm.tsx`
- Modal: `src/components/auth/AuthModal.tsx`
- Context: `src/contexts/AuthContext.tsx`
- Routes: `src/app/auth/`

Your authentication system is **production-ready** and fully integrated! 🎉
