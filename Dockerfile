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

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci

# Copy application files
COPY . .

# Build application
RUN npm run build

# Prune devDependencies after build to reduce image size
RUN npm prune --production

# Expose port
EXPOSE 5000

# Set production environment
ENV NODE_ENV=production

# Start application
CMD ["npm", "start"]

