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

# Copy package files FIRST (for better layer caching)
COPY package*.json ./

# Install dependencies with caching
# Railway caches this layer if package.json hasn't changed
RUN npm ci --prefer-offline --no-audit

# Copy application files
COPY . .

# Build arguments for Vite environment variables
# Railway provides these as environment variables during build
ARG VITE_KINDE_DOMAIN
ARG VITE_KINDE_CLIENT_ID
ARG VITE_KINDE_REDIRECT_URL
ARG VITE_KINDE_LOGOUT_REDIRECT_URL

# Set as environment variables so Vite can access them during build
ENV VITE_KINDE_DOMAIN=$VITE_KINDE_DOMAIN
ENV VITE_KINDE_CLIENT_ID=$VITE_KINDE_CLIENT_ID
ENV VITE_KINDE_REDIRECT_URL=$VITE_KINDE_REDIRECT_URL
ENV VITE_KINDE_LOGOUT_REDIRECT_URL=$VITE_KINDE_LOGOUT_REDIRECT_URL

# Build application (Vite will embed these variables in the bundle)
# Use fewer workers to reduce memory usage during build
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Prune devDependencies after build to reduce image size
RUN npm prune --production --prefer-offline

# Expose port
EXPOSE 5000

# Set production environment
ENV NODE_ENV=production

# Start application - Railway will use startCommand from railway.json
# But this ensures the container can start if Railway doesn't override
CMD ["npx", "tsx", "dist/server/index.ts"]
