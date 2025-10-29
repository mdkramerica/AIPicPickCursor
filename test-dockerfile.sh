#!/bin/bash
# Test script to validate Dockerfile and dependencies
# This simulates what Railway will do during deployment

set -e

echo "🧪 Testing Dockerfile and dependencies..."
echo ""

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile not found"
    exit 1
fi

echo "✅ Dockerfile exists"

# Check Dockerfile syntax
echo ""
echo "📋 Dockerfile contents:"
cat Dockerfile
echo ""

# Validate Dockerfile has required sections
echo "🔍 Validating Dockerfile structure..."

if ! grep -q "FROM node" Dockerfile; then
    echo "❌ Dockerfile missing FROM node"
    exit 1
fi
echo "✅ Has FROM node"

if ! grep -q "libcairo2-dev" Dockerfile; then
    echo "❌ Dockerfile missing canvas system dependencies"
    exit 1
fi
echo "✅ Has canvas system dependencies"

if ! grep -q "npm ci" Dockerfile || ! grep -q "npm run build" Dockerfile; then
    echo "❌ Dockerfile missing npm commands"
    exit 1
fi
echo "✅ Has npm build commands"

# Check .dockerignore exists
if [ ! -f ".dockerignore" ]; then
    echo "⚠️  .dockerignore not found (optional but recommended)"
else
    echo "✅ .dockerignore exists"
fi

# Check package.json has required dependencies
echo ""
echo "📦 Checking package.json dependencies..."

if ! grep -q "@tensorflow/tfjs-node" package.json; then
    echo "❌ Missing @tensorflow/tfjs-node in package.json"
    exit 1
fi
echo "✅ Has @tensorflow/tfjs-node"

if ! grep -q "@vladmandic/face-api" package.json; then
    echo "❌ Missing @vladmandic/face-api in package.json"
    exit 1
fi
echo "✅ Has @vladmandic/face-api"

if ! grep -q '"canvas"' package.json; then
    echo "❌ Missing canvas in package.json"
    exit 1
fi
echo "✅ Has canvas"

# Test local dependencies (if available)
echo ""
echo "🔬 Testing local dependencies..."

if node -e "require('canvas'); console.log('✅ Canvas works locally')" 2>/dev/null; then
    echo "✅ Canvas works locally"
else
    echo "⚠️  Canvas not available locally (this is OK - will be built in Docker)"
fi

if node -e "require('@tensorflow/tfjs-node'); console.log('✅ TensorFlow.js works locally')" 2>/dev/null; then
    echo "✅ TensorFlow.js works locally"
else
    echo "⚠️  TensorFlow.js not available locally (this is OK - will be installed in Docker)"
fi

if node -e "require('@vladmandic/face-api'); console.log('✅ Face-api works locally')" 2>/dev/null; then
    echo "✅ Face-api works locally"
else
    echo "⚠️  Face-api not available locally (this is OK - will be installed in Docker)"
fi

echo ""
echo "✅ Dockerfile validation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Push Dockerfile to your repository"
echo "2. Railway will automatically detect and use it"
echo "3. Check Railway build logs to verify canvas compiles"
echo "4. Test grouping endpoint after deployment"

