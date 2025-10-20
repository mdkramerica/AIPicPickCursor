# Clerk Authentication Setup Guide

This application now uses **Clerk** for authentication instead of Replit Auth. Clerk provides a better user experience with:
- Email/password authentication
- Social logins (Google, GitHub, etc.)
- Magic links (passwordless)
- Beautiful pre-built UI components
- User management dashboard

## Quick Start (5 minutes)

### 1. Create a Clerk Account

1. Go to https://clerk.com
2. Sign up for a free account (10,000 MAU free forever)
3. Create a new application

### 2. Get Your API Keys

From your Clerk Dashboard (https://dashboard.clerk.com):

1. Go to **API Keys** in the sidebar
2. Copy the following keys:
   - **Publishable Key** (starts with `pk_test_...` or `pk_live_...`)
   - **Secret Key** (starts with `sk_test_...` or `sk_live_...`)

### 3. Configure Environment Variables

#### For Local Development

Update `.env`:
```bash
# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here

# Frontend (Vite)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

#### For Railway Deployment

Set these environment variables in Railway:
```bash
CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

### 4. Configure Clerk Application Settings

In your Clerk Dashboard:

1. **Application Name**: AIPicPick (or your preferred name)

2. **Authentication Options** (Settings → Authentication):
   - ✅ Email/Password
   - ✅ Google (recommended for easy onboarding)
   - ✅ GitHub (optional)
   - ✅ Magic Links (optional, passwordless)

3. **Sign-up Restrictions** (Settings → Restrictions):
   - Allow sign-ups: ✅ Enabled
   - Email domain restrictions: None (or add your domain)

4. **User Profile** (Settings → User & Authentication):
   - Required fields: Email
   - Optional fields: First Name, Last Name
   - Profile photo: Enabled

### 5. Set Up Webhooks (Optional but Recommended)

Webhooks keep your database in sync with Clerk's user data.

1. In Clerk Dashboard, go to **Webhooks**
2. Click **Add Endpoint**
3. Enter your endpoint URL:
   - Production: `https://your-app.up.railway.app/api/webhooks/clerk`
   - Development: Use ngrok or similar
4. Select events to listen for:
   - `user.created` ✅
   - `user.updated` ✅
   - `user.deleted` ✅
5. Copy the **Signing Secret** (starts with `whsec_...`)
6. Add to environment variables:
   ```bash
   CLERK_WEBHOOK_SECRET=whsec_your_secret_here
   ```

## Features Enabled

### For Users

- **Easy Sign-up**: Email/password or social login
- **Password Reset**: Built-in "Forgot password" flow
- **Profile Management**: Users can update their profile
- **Session Management**: Secure JWT-based sessions
- **Multi-device**: Sessions work across devices

### For Developers

- **Pre-built Components**: Sign-in modal, user button
- **User Management Dashboard**: View and manage users in Clerk
- **Analytics**: User sign-up and activity metrics
- **Security**: SOC 2 compliant, GDPR ready

## Testing Authentication

### Local Development

1. Start the server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:5001`

3. Click "Get Started" or "Sign In"

4. Create a test account or sign in with Google

5. You should be redirected to the dashboard

### Production

1. Visit your Railway URL

2. Test the sign-up flow

3. Check the Clerk Dashboard to see the new user

## Customization

### Customize the Sign-in Modal

Update `client/src/App.tsx`:

```typescript
<ClerkProvider 
  publishableKey={CLERK_PUBLISHABLE_KEY}
  appearance={{
    baseTheme: your-theme,
    variables: { colorPrimary: '#your-color' }
  }}
>
```

### Add More Auth Options

In Clerk Dashboard → Settings → Authentication:
- Add social providers (Google, Facebook, Twitter, etc.)
- Enable magic links
- Configure MFA (Multi-Factor Authentication)

### Custom User Fields

In Clerk Dashboard → User & Authentication → Metadata:
- Add custom fields to user profiles
- Access via `user.publicMetadata` or `user.privateMetadata`

## Troubleshooting

### "Missing Clerk Publishable Key" Error

**Problem**: Frontend can't find `VITE_CLERK_PUBLISHABLE_KEY`

**Solution**:
1. Make sure `.env` has `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
2. Restart the dev server (`npm run dev`)
3. Vite only loads `VITE_*` env vars at build time

### "Unauthorized" on API Calls

**Problem**: Backend can't verify Clerk tokens

**Solution**:
1. Verify `CLERK_SECRET_KEY` is set in backend environment
2. Check Railway environment variables
3. Ensure the key starts with `sk_test_` or `sk_live_`

### Webhooks Not Working

**Problem**: User data not syncing to database

**Solution**:
1. Check webhook URL is correct and accessible
2. Verify `CLERK_WEBHOOK_SECRET` is set
3. Test webhook in Clerk Dashboard → Webhooks → Test
4. Check Railway logs for webhook errors

### Users Can Sign Up But Can't Access App

**Problem**: User exists in Clerk but not in database

**Solution**:
1. User will be created in DB on first login
2. Or set up webhooks to sync immediately
3. Check server logs for database errors

## Migration from Replit Auth

If you're migrating from Replit Auth:

### Data Migration

1. Users need to create new accounts with Clerk
2. Existing photos/sessions are tied to old user IDs
3. Options:
   - Let users re-create their profiles
   - Write a migration script to map old IDs to new Clerk IDs
   - Use Clerk's `externalId` to maintain old IDs

### Code Changes

All Replit Auth code has been replaced:
- ✅ `server/replitAuth.ts` → `server/clerkAuth.ts`
- ✅ `req.user.claims.sub` → `req.userId`
- ✅ `/api/login` → Clerk modal
- ✅ Session management → Clerk handles it

## Production Checklist

Before going live:

- [ ] Switch from test keys (`pk_test_`) to live keys (`pk_live_`)
- [ ] Configure production domain in Clerk
- [ ] Set up webhooks with production URL
- [ ] Test sign-up flow end-to-end
- [ ] Test sign-out and re-login
- [ ] Configure email templates in Clerk
- [ ] Set up custom domain (optional)
- [ ] Enable security features (MFA, session duration)

## Resources

- **Clerk Documentation**: https://clerk.com/docs
- **React Quickstart**: https://clerk.com/docs/quickstarts/react
- **Express Backend**: https://clerk.com/docs/backend-requests/handling/nodejs
- **Dashboard**: https://dashboard.clerk.com
- **Support**: https://clerk.com/support

## Cost

Clerk is free for up to 10,000 monthly active users. Beyond that:
- Pro: $25/month + $0.02/MAU
- Enterprise: Custom pricing

For most applications, the free tier is sufficient.

---

**Questions?** Check the [Clerk Documentation](https://clerk.com/docs) or open an issue on GitHub.
