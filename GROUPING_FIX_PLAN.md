# Grouping Dependency Error - Fix Plan

## Problem Diagnosis

**Error**: All dependencies failing to load in Docker/Railway:
- TensorFlow.js
- Face-api.js  
- Canvas
- Image Loader
- Storage

**Root Cause**: `photoGroupingService.ts` uses `require()` (CommonJS) in an ES module project (`"type": "module"` in package.json). This causes module loading failures at runtime in the compiled JavaScript.

## Evidence

1. **`photoAnalysis.ts` works** - Uses ES6 imports:
   ```typescript
   import * as tf from '@tensorflow/tfjs-node';
   import * as faceapi from '@vladmandic/face-api';
   import { createCanvas } from 'canvas';
   ```

2. **`photoGroupingService.ts` fails** - Uses CommonJS require():
   ```typescript
   tf = require('@tensorflow/tfjs-node');
   ```

3. **Project is ES modules**: `package.json` has `"type": "module"`

4. **Docker build succeeds**, but runtime fails - modules aren't loading

## Solution

Convert `photoGroupingService.ts` to use ES6 imports (like `photoAnalysis.ts`) instead of `require()`.

### Approach 1: Direct ES6 Imports (Recommended)
Change to top-level imports, but wrap in try-catch or use conditional imports.

### Approach 2: Dynamic Imports
Use `import()` for conditional loading, but this changes the async nature.

### Approach 3: Create Require Helper
Use `createRequire()` to bridge ES modules and CommonJS, but this is a workaround.

## Recommended Fix: Direct ES6 Imports with Error Handling

Change `photoGroupingService.ts` to use ES6 imports like `photoAnalysis.ts`, but handle missing dependencies gracefully:

1. Use top-level imports for required dependencies
2. Check availability at runtime
3. Provide clear error messages if dependencies are missing

## Implementation Steps

1. Replace `require()` calls with ES6 `import` statements
2. Keep the `checkDependencies()` method but base it on actual module availability
3. Update error messages to be more actionable
4. Test in Docker to ensure modules load correctly

