# Docker Migration Checklist (Nixpacks → Dockerfile)

## Changes Made ✅

1. **railway.json**
   - Changed `build.builder` from `NIXPACKS` to `DOCKERFILE`
   - Removed `buildCommand` (handled in Dockerfile)
   - Updated `startCommand` to `npx tsx dist/server/index.ts`
   - Removed `NODE_ENV=production` from startCommand (set in Dockerfile)

2. **Dockerfile Created**
   - Installs system dependencies for `canvas` (libcairo2-dev, libpango1.0-dev, etc.)
   - Handles Vite build-time environment variables via ARG/ENV
   - Prunes devDependencies after build to reduce image size
   - Sets NODE_ENV=production
   - Exposes port 5000

3. **.dockerignore Created**
   - Excludes unnecessary files from Docker build context

## Differences: Nixpacks vs Docker

### Nixpacks (Auto-detection)
- Automatically detects Node.js projects
- Installs dependencies via `npm install`
- Auto-detects build commands (runs `npm run build` if present)
- Sets up production environment automatically
- Handles environment variables automatically
- May not install native dependencies correctly (like `canvas`)

### Docker (Manual Control)
- Full control over build process
- Must explicitly install system dependencies
- Must handle build-time vs runtime environment variables
- Must specify all build steps
- More predictable but requires maintenance

## What to Monitor

1. **Environment Variables**
   - ✅ Vite build-time vars (`VITE_*`) - Handled via ARG/ENV in Dockerfile
   - ✅ Runtime vars (`DATABASE_URL`, `R2_*`, etc.) - Set in Railway dashboard
   - ⚠️ Ensure all required vars are set in Railway

2. **Build Performance**
   - Docker builds may be slower initially (building layers)
   - Subsequent builds should be faster (layer caching)
   - Monitor build times in Railway

3. **Image Size**
   - Docker image may be larger than Nixpacks
   - Currently ~850MB with production dependencies
   - Could optimize further with multi-stage builds if needed

4. **Native Dependencies**
   - ✅ `canvas` - System dependencies installed
   - ✅ `@tensorflow/tfjs-node` - Should work with Node 18
   - ✅ `@vladmandic/face-api` - Should work with canvas

## Potential Issues to Watch For

1. **Memory Limits**
   - Railway free tier: 512MB RAM
   - Analysis may hit memory limits with large batches
   - Monitor memory usage in Railway metrics

2. **Build-Time vs Runtime Variables**
   - Vite vars must be available at BUILD time (handled via ARG/ENV)
   - Runtime vars don't need to be in Dockerfile

3. **Node Version**
   - Using Node 18 (via `node:18-slim`)
   - Match local development Node version
   - Can upgrade to Node 20+ if needed

4. **File Permissions**
   - Docker runs as root by default
   - Railway may run as non-root (should be fine)

## Testing Checklist

- [x] Build succeeds
- [x] Application starts
- [x] API endpoints work
- [x] Photo upload works
- [x] Analysis works
- [x] Frontend loads correctly
- [x] Environment variables accessible
- [ ] Large batch analysis (stress test)
- [ ] Memory usage monitoring

## Rollback Plan

If Docker causes issues:
1. Change `railway.json` back to `"builder": "NIXPACKS"`
2. Remove `Dockerfile` or rename it
3. Railway will auto-detect and use Nixpacks

