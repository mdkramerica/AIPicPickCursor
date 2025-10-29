# Grouping Service Dependency Error - Debug & Fix Guide

## 🔍 Problem Summary

**Error**: `500: AI grouping service unavailable due to missing dependencies`  
**When**: After uploading photos and trying to start grouping  
**Root Cause**: Required AI/ML dependencies not installed or not loading properly in production

---

## 🎯 Root Cause Analysis

The photo grouping service requires these dependencies:
1. `@tensorflow/tfjs-node` - TensorFlow.js for Node.js
2. `@vladmandic/face-api` - Face detection and analysis
3. `canvas` - Canvas API for image processing
4. `./imageLoader` - Custom image loader module

These are loaded with `require()` at module initialization. If any fail to load, the service won't work.

---

## 🔧 Fixes Implemented

### 1. Early Dependency Check ✅
**File**: `server/routes.ts` (line 958-967)

**Added**: Check dependencies before starting grouping analysis

```typescript
// Check dependencies before starting grouping
const dependencyCheck = photoGroupingService.checkDependencies();
if (!dependencyCheck.available) {
  logger.error(`Grouping dependencies missing`, {
    sessionId,
    userId,
    missingDependencies: dependencyCheck.missingDependencies
  });
  throw new AppError(500, `AI grouping service unavailable. Missing dependencies: ${dependencyCheck.missingDependencies.join(', ')}. Please ensure all required packages are installed: @tensorflow/tfjs-node, @vladmandic/face-api, canvas`);
}
```

**Benefit**: Fails fast with clear error message instead of failing during processing

---

### 2. Improved Error Messages ✅
**File**: `server/photoGroupingService.ts` (line 688-692)

**Added**: Explicit dependency error flags

```typescript
const error = new Error(`Photo grouping service unavailable due to missing dependencies: ${dependencyCheck.missingDependencies.join(', ')}`);
(error as any).isDependencyError = true;
(error as any).missingDependencies = dependencyCheck.missingDependencies;
throw error;
```

**Benefit**: Route handler can identify dependency errors and provide specific guidance

---

### 3. Enhanced Error Handler ✅
**File**: `server/routes.ts` (line 1037-1062)

**Updated**: Better error detection and messaging

```typescript
if (isDependencyError) {
  const missingDeps = (groupingError as any).missingDependencies || ['Unknown'];
  throw new AppError(500, `AI grouping service unavailable. Missing dependencies: ${Array.isArray(missingDeps) ? missingDeps.join(', ') : missingDeps}. Please ensure all required packages are installed: @tensorflow/tfjs-node, @vladmandic/face-api, canvas`);
}
```

**Benefit**: Users see exactly which dependencies are missing

---

## 🚀 Production Deployment Checklist

### Verify Dependencies Are Installed

1. **Check package.json** - Ensure these are listed:
   ```json
   {
     "dependencies": {
       "@tensorflow/tfjs-node": "^4.22.0",
       "@vladmandic/face-api": "^1.7.15",
       "canvas": "^3.2.0"
     }
   }
   ```

2. **Check node_modules** - Verify packages are installed:
   ```bash
   npm list @tensorflow/tfjs-node @vladmandic/face-api canvas
   ```

3. **Check for native dependencies** - `canvas` requires native compilation:
   ```bash
   # Canvas requires system libraries
   # On Ubuntu/Debian:
   sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
   
   # On macOS:
   # Usually works with Xcode Command Line Tools
   ```

4. **Check Railway/Railway environment**:
   - Ensure buildpack supports native dependencies
   - Verify build process completes successfully
   - Check build logs for canvas compilation errors

---

## 🔍 Debugging Steps

### 1. Check Server Logs

Look for these log messages:
- ✅ `TensorFlow.js loaded successfully`
- ✅ `Face-api.js loaded successfully`
- ✅ `Canvas loaded successfully`
- ✅ `Image loader loaded successfully`
- ✅ `PhotoGroupingService initialized successfully with all dependencies`

If you see warnings:
- ❌ `Failed to load TensorFlow.js`
- ❌ `Failed to load Face-api.js`
- ❌ `Failed to load Canvas`
- ❌ `PhotoGroupingService initialized with missing dependencies`

### 2. Test Dependency Loading

Add a test endpoint to check dependencies:

```typescript
app.get("/api/debug/dependencies", asyncHandler(async (req, res) => {
  const deps = photoGroupingService.checkDependencies();
  res.json({
    available: deps.available,
    missingDependencies: deps.missingDependencies,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  });
}));
```

### 3. Check Railway Build Logs

Look for:
- Canvas compilation errors
- Native module build failures
- Missing system libraries

Common issues:
- `canvas` fails to build → Missing system libraries
- `@tensorflow/tfjs-node` fails → Node.js version mismatch
- Module not found → Package not installed or wrong path

---

## 🛠️ Fixes for Common Issues

### Issue 1: Canvas Not Building

**Symptoms**: `Failed to load Canvas` error

**Fix**:
```bash
# Install system dependencies (on Railway, add to buildpack)
apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev
```

**Railway**: Add buildpack or custom Dockerfile with these dependencies

---

### Issue 2: TensorFlow.js Not Loading

**Symptoms**: `Failed to load TensorFlow.js` error

**Fix**:
1. Check Node.js version (should be 18+)
2. Verify package is installed: `npm list @tensorflow/tfjs-node`
3. Check for version conflicts

---

### Issue 3: Module Import Errors

**Symptoms**: `Cannot find module` errors

**Fix**:
1. Ensure `node_modules` is in production build
2. Check `.dockerignore` or build excludes
3. Verify `package.json` dependencies are correct

---

## 📋 Railway-Specific Fixes

### Option 1: Use Railway Buildpacks

Add to `railway.toml` or build settings:
```toml
[build]
builder = "nixpacks"
```

Or use custom Dockerfile:
```dockerfile
FROM node:18-slim

# Install system dependencies for canvas
RUN apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "start"]
```

### Option 2: Check Railway Environment Variables

Ensure these are set:
- `NODE_ENV=production`
- `NPM_CONFIG_PRODUCTION=false` (if needed for dev dependencies)

---

## 🧪 Testing After Fix

1. **Check Dependencies**:
   ```bash
   curl https://your-app.railway.app/api/debug/dependencies
   ```

2. **Try Small Upload**:
   - Upload 2-3 photos
   - Start grouping
   - Should work without dependency errors

3. **Monitor Logs**:
   - Watch for dependency loading logs
   - Check for any runtime errors

---

## ⚠️ Fallback Option

If dependencies can't be installed, you can:

1. **Disable Grouping Feature**:
   ```typescript
   // In routes.ts, check if dependencies are available before registering route
   if (photoGroupingService.checkDependencies().available) {
     app.post("/api/sessions/:sessionId/group-analyze", ...);
   }
   ```

2. **Use Basic Grouping**:
   - Modify `extractBasicFeatures()` to work without AI dependencies
   - Use metadata-only grouping (timestamp, file size, etc.)

---

## 📊 Expected Behavior After Fix

### Before Fix
- ❌ Silent failures during grouping
- ❌ Generic "grouping failed" errors
- ❌ No indication of missing dependencies

### After Fix
- ✅ Early detection of missing dependencies
- ✅ Clear error messages listing missing packages
- ✅ Guidance on how to fix
- ✅ Better logging for debugging

---

## 🔄 Next Steps

1. **Immediate**: Check Railway build logs for dependency installation
2. **Short-term**: Add debug endpoint to check dependencies
3. **Long-term**: Consider fallback grouping algorithm that doesn't require AI dependencies

---

**Status**: Error handling improved, but dependencies still need to be installed in production  
**Priority**: HIGH - Blocks grouping feature  
**Next Action**: Verify dependencies are installed in Railway production environment

