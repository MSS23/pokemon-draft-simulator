# Security Implementation Guide

This document outlines the security measures implemented in the Pokemon Draft application and provides guidance for securing the application for production use.

## Current Security Status

### ✅ Implemented

1. **Input Validation & Sanitization**
   - Comprehensive validation module at `src/lib/validation.ts`
   - Sanitization for strings, numbers, IDs, URLs
   - Prevention of XSS, SQL injection, and overflow attacks
   - Rate limiting utilities (in-memory)

2. **Database Schema**
   - Row Level Security (RLS) enabled on all tables
   - Proper foreign key relationships
   - Cascading deletes for data integrity
   - Performance indexes

3. **Error Boundaries**
   - React error boundaries throughout the app
   - Graceful error handling in UI components
   - Error tracking infrastructure ready

### ⚠️ Partially Implemented

1. **RLS Policies**
   - **CURRENT STATE**: Permissive "allow all" policies (DEVELOPMENT ONLY)
   - **READY TO APPLY**: Secure policies in `database/migrations/APPLY_SECURITY.sql`
   - **ACTION REQUIRED**: Apply the security migration before production

2. **Authentication**
   - Guest ID system working
   - Supabase Auth infrastructure ready
   - **ACTION REQUIRED**: Implement proper user authentication

3. **Rate Limiting**
   - Client-side rate limiting implemented
   - **ACTION REQUIRED**: Add server-side/edge rate limiting

### ❌ Not Implemented (High Priority)

1. **Error Tracking Service**
   - Sentry or similar monitoring service
   - Production error logging
   - Performance monitoring

2. **CSRF Protection**
   - Token-based CSRF protection
   - Secure cookie settings

3. **IP-based Rate Limiting**
   - Edge/server-side rate limiting
   - Bot protection
   - CAPTCHA for sensitive operations

---

## Applying Security Policies

### Step 1: Prepare for Migration

**IMPORTANT**: The current database uses permissive "allow all" policies to simplify development. Before applying secure policies, ensure:

1. ✅ You have a backup of your database
2. ✅ You understand the guest ID system (user IDs like `guest-xyz`)
3. ✅ You've tested the application with guest users
4. ✅ You have Supabase access to rollback if needed

### Step 2: Apply Security Migration

```sql
-- Run this in your Supabase SQL Editor
-- File: database/migrations/APPLY_SECURITY.sql

-- This will:
-- 1. Keep RLS enabled on all tables
-- 2. Drop permissive policies
-- 3. Apply secure, guest-compatible policies
-- 4. Add performance indexes
-- 5. Create helper functions
```

**Copy and paste the contents of `database/migrations/APPLY_SECURITY.sql` into your Supabase SQL Editor and execute.**

### Step 3: Test After Migration

After applying the security migration, test these scenarios:

```bash
# 1. Create a new draft as guest
# 2. Join draft as another guest
# 3. Make picks/bids
# 4. View draft as spectator
# 5. Try to access other users' private drafts (should fail)
# 6. Try to modify another user's team (should fail)
```

### Step 4: Verify Policies

Run this query in Supabase to verify policies are active:

```sql
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

You should see policies like:
- `View accessible drafts`
- `Hosts can update drafts`
- `Team owners can create picks`
- etc.

### Rollback (if needed)

If something goes wrong, you can rollback to permissive policies:

```sql
-- Re-run the original schema policies
-- From: supabase-schema.sql lines 126-133

DROP POLICY IF EXISTS "View accessible drafts" ON drafts;
-- ... (drop all new policies)

CREATE POLICY "Allow all operations on drafts" ON drafts FOR ALL USING (true);
CREATE POLICY "Allow all operations on teams" ON teams FOR ALL USING (true);
-- ... (recreate permissive policies)
```

---

## Security Checklist for Production

### Critical (Must Do Before Launch)

- [ ] **Apply RLS Security Migration**
  - Run `database/migrations/APPLY_SECURITY.sql`
  - Verify all policies are active
  - Test guest and authenticated user flows

- [ ] **Implement Proper Authentication**
  - Set up Supabase Auth
  - Migrate from guest IDs to real users
  - Add email verification
  - Implement password reset flow

- [ ] **Add Server-Side Rate Limiting**
  - Use Vercel edge config or similar
  - Limit draft creation (e.g., 5 per hour per IP)
  - Limit bid/pick operations (e.g., 100 per minute per user)
  - Add CAPTCHA for draft creation

- [ ] **Set Up Error Tracking**
  - Integrate Sentry or similar service
  - Configure error filtering (don't send sensitive data)
  - Set up alerts for critical errors
  - Monitor error rates

- [ ] **Environment Variable Security**
  - Ensure `.env.local` is in `.gitignore`
  - Use Vercel/hosting platform env vars for production
  - Never commit API keys or secrets
  - Rotate Supabase keys regularly

- [ ] **Input Validation**
  - Review all user inputs use `validation.ts`
  - Add validation to API routes
  - Sanitize all database writes
  - Validate file uploads (if added)

### High Priority

- [ ] **HTTPS Only**
  - Force HTTPS in production
  - Set secure cookie flags
  - Enable HSTS headers

- [ ] **Content Security Policy**
  - Add CSP headers
  - Whitelist allowed domains
  - Prevent inline scripts where possible

- [ ] **CSRF Protection**
  - Implement CSRF tokens
  - Use SameSite cookie attribute
  - Validate origin headers

- [ ] **Security Headers**
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy

- [ ] **Audit Logging**
  - Log sensitive operations (draft creation, user changes)
  - Monitor unusual patterns
  - Set up alerts for:
    - Rapid draft creation
    - Mass deletions
    - Unusual bid patterns

### Medium Priority

- [ ] **Session Management**
  - Implement secure session tokens for guests
  - Set appropriate session timeouts
  - Add session revocation
  - Implement "remember me" securely

- [ ] **Database Backups**
  - Set up automated backups
  - Test restore procedures
  - Document backup retention policy

- [ ] **Monitoring & Alerts**
  - Set up uptime monitoring
  - Configure performance alerts
  - Monitor database connection pool
  - Track API response times

- [ ] **Dependency Security**
  - Run `npm audit` regularly
  - Keep dependencies updated
  - Use Dependabot or similar
  - Review security advisories

### Nice to Have

- [ ] **Penetration Testing**
  - Conduct security audit
  - Fix discovered vulnerabilities
  - Re-test after fixes

- [ ] **Bug Bounty Program**
  - Consider responsible disclosure policy
  - Provide security contact

- [ ] **Two-Factor Authentication**
  - Add 2FA option for users
  - Require 2FA for admin actions

---

## Security Best Practices

### For Developers

1. **Never Trust User Input**
   ```typescript
   // ❌ BAD
   const name = req.body.name
   await supabase.from('teams').insert({ name })

   // ✅ GOOD
   import { validateName } from '@/lib/validation'
   const result = validateName(req.body.name)
   if (!result.isValid) {
     throw new Error(result.error)
   }
   await supabase.from('teams').insert({ name: result.sanitized })
   ```

2. **Use Validation Module**
   ```typescript
   import {
     validateName,
     validateRoomCode,
     validateBudget,
     checkRateLimit
   } from '@/lib/validation'
   ```

3. **Handle Errors Securely**
   ```typescript
   // ❌ BAD - Leaks implementation details
   catch (error) {
     return { error: error.message }
   }

   // ✅ GOOD - Generic error message
   catch (error) {
     console.error('Draft creation failed:', error)
     return { error: 'Failed to create draft' }
   }
   ```

4. **Check Permissions**
   ```typescript
   // Always verify user owns resource before modifying
   const { data: team } = await supabase
     .from('teams')
     .select()
     .eq('id', teamId)
     .eq('owner_id', userId)
     .single()

   if (!team) {
     throw new Error('Unauthorized')
   }
   ```

### For Database Operations

1. **Use Parameterized Queries** (Supabase does this automatically)
2. **Limit SELECT columns** (don't select * in production)
3. **Use transactions** for multi-step operations
4. **Add timeouts** for long-running queries

### For API Routes

1. **Validate all inputs**
2. **Check rate limits**
3. **Return consistent error format**
4. **Log security events**
5. **Use HTTPS only**

---

## Known Limitations

1. **Guest ID System**
   - Not suitable for permanent accounts
   - Can be bypassed (users can create multiple IDs)
   - Should be replaced with proper auth for production

2. **In-Memory Rate Limiting**
   - Resets on server restart
   - Not shared across serverless instances
   - Should be replaced with Redis or edge config

3. **No IP-based Protection**
   - Currently no IP blocking
   - No geographic restrictions
   - No bot detection

---

## Security Incident Response

If you discover a security issue:

1. **Don't panic** - assess the severity
2. **Document** - what happened, when, what data affected
3. **Contain** - disable affected features if needed
4. **Fix** - apply patches/updates
5. **Notify** - inform affected users if data compromised
6. **Learn** - add preventive measures

### Emergency Contacts

- Supabase Support: [support page]
- Vercel Support: [support page]
- Security Email: [your security contact]

---

## Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)

---

## Regular Security Tasks

### Daily
- Monitor error logs
- Check for unusual activity

### Weekly
- Review audit logs
- Check for failed login attempts
- Update dependencies if needed

### Monthly
- Run `npm audit`
- Review access logs
- Check database performance
- Review rate limit settings

### Quarterly
- Security audit
- Update RLS policies if needed
- Review and rotate API keys
- Penetration testing

---

## Questions?

If you have questions about security implementation, please:
1. Check this documentation
2. Review the code in `src/lib/validation.ts`
3. Check the migration file `database/migrations/APPLY_SECURITY.sql`
4. Contact the development team

**Remember**: Security is an ongoing process, not a one-time task!
