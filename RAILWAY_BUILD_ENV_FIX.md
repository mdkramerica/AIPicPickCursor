# Railway Build Environment Variables Fix

## Problem
Vite requires `VITE_*` environment variables at **build time** to embed them in the JavaScript bundle. Railway sets these as runtime environment variables, but they weren't being passed to the Docker build process.

## Solution

Railway automatically passes environment variables as Docker build arguments, but we need to:
1. Declare them as `ARG` in Dockerfile
2. Convert them to `ENV` so Vite can access them

## Implementation

Updated `Dockerfile` to:
```dockerfile
# Build arguments for Vite environment variables
ARG VITE_KINDE_DOMAIN
ARG VITE_KINDE_CLIENT_ID
ARG VITE_KINDE_REDIRECT_URL
ARG VITE_KINDE_LOGOUT_REDIRECT_URL

# Set as environment variables so Vite can access them during build
ENV VITE_KINDE_DOMAIN=$VITE_KINDE_DOMAIN
ENV VITE_KINDE_CLIENT_ID=$VITE_KINDE_CLIENT_ID
ENV VITE_KINDE_REDIRECT_URL=$VITE_KINDE_REDIRECT_URL
ENV VITE_KINDE_LOGOUT_REDIRECT_URL=$VITE_KINDE_LOGOUT_REDIRECT_URL
```

## How Railway Handles This

Railway automatically passes all environment variables as build arguments when building with Docker. The `ARG` directives tell Docker to accept them, and `ENV` makes them available to the build process.

## Verification

After deployment, check:
1. Build logs should show variables are available
2. Client bundle should have Kinde config embedded
3. No "Missing Kinde configuration" errors

## Alternative (if above doesn't work)

If Railway still doesn't pass them automatically, we can:
1. Use Railway's build-time secrets
2. Create a `.env` file in the build context
3. Use Railway's variable groups

But the ARG/ENV approach should work automatically.

