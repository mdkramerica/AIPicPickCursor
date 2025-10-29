# Railway Canvas Dependency Fix

## Problem
The `canvas` package requires native compilation and system libraries. Railway's default build environment may not have these installed.

## Solution: Create Nixpacks Configuration

Since Railway uses Nixpacks by default, we need to ensure system dependencies are available.

### Option 1: Create `nixpacks.toml` (Recommended)

Create a `nixpacks.toml` file in the root directory:

```toml
[phases.setup]
nixPkgs = [
  "nodejs-18_x",
  "python3",
  "cairo",
  "pango",
  "jpeg",
  "giflib",
  "librsvg",
]

[phases.install]
cmds = [
  "npm ci --only=production",
]

[phases.build]
cmds = [
  "npm run build",
]

[start]
cmd = "npm start"
```

### Option 2: Create `.railway/railway.toml` Directory Structure

Create `.railway/railway.toml`:

```toml
[build]
builder = "nixpacks"

[build.buildCommand]
nixPkgs = [
  "nodejs-18_x",
  "python3",
  "cairo",
  "pango",
  "jpeg",
  "giflib",
  "librsvg",
]
```

### Option 3: Create Dockerfile (Most Reliable)

Create a `Dockerfile` in the root:

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

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy application files
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 5000

# Start application
CMD ["npm", "start"]
```

And create `.dockerignore`:

```
node_modules
dist
.git
.env.local
*.log
```

## Recommended Approach

**Use Option 3 (Dockerfile)** - It's the most reliable and explicit.

## Quick Fix Steps

1. Create `Dockerfile` (use content above)
2. Create `.dockerignore` (use content above)
3. Push to Railway
4. Railway will detect Dockerfile and use it instead of Nixpacks

## Verify Fix

After deployment, check logs for:
- ✅ Canvas compilation success
- ✅ All dependencies loading
- ✅ No "Failed to load" errors

Test the grouping endpoint to confirm it works.

