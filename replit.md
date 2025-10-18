# AI Group Photo Selector

## Overview
The AI Group Photo Selector is an intelligent web application designed to simplify the process of choosing the best group photo. It leverages AI-powered computer vision to analyze multiple photos from the same scene, identifying the optimal shot by detecting open eyes, smiles, and overall face quality. The primary purpose is to eliminate manual photo review, offering users an instant recommendation for the picture where everyone looks their best. Photo selection prioritizes eyes open count first, then uses smiles and face quality as tiebreakers.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite.
- **UI Component System**: Radix UI primitives with shadcn/ui styling, customized via Tailwind CSS ("new-york" style variant).
- **Design Philosophy**: Photo-centric utility interface inspired by Google Photos and Linear, emphasizing clarity, user control, and subtle AI integration with a vibrant blue-purple primary color. Supports light/dark mode.
- **State Management**: TanStack Query for server state, API caching, and data synchronization.
- **Routing**: Wouter for lightweight client-side routing.
- **File Upload**: Uppy dashboard for multi-file image uploads with drag-and-drop.

### Backend Architecture
- **Runtime**: Node.js with Express server in ESM mode.
- **API Pattern**: RESTful endpoints with JSON format, centrally registered in `server/routes.ts`.
- **Photo Analysis Service**: Real computer vision implemented with TensorFlow.js and face-api.js (`server/photoAnalysis.ts`) for face detection, eye state, smile detection, and quality scoring using ML models.
- **Session Management**: Express-session with PostgreSQL session store.

### Database Architecture
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database Provider**: Neon serverless PostgreSQL with WebSocket connections.
- **Schema Design**:
    - `users`: User profiles from authentication.
    - `photoSessions`: Groups of photos for comparison.
    - `photos`: Individual photo metadata and analysis results.
    - `faces`: Face detection data per person per photo.
- **Data Flow**: Photos uploaded to object storage, analysis triggered, real face detection, face data and scores persisted, best photo recommended. Photo `fileUrl` is stored as a permanent `/objects/...` path.

### Authentication & Authorization
- **Provider**: Replit Auth using OpenID Connect (OIDC).
- **Flow**: Passport.js strategy for OIDC token exchange and session establishment.
- **Session Security**: HTTP-only cookies with 7-day expiration and secure flag.
- **Authorization Pattern**: Middleware-based authentication (`isAuthenticated`) for API routes. Object storage uses ACLs.

### Object Storage
- **Provider**: Google Cloud Storage via Replit's sidecar credential system.
- **Access Control**: Custom ACL policy system stored in object metadata.
- **Upload Flow**: Client requests signed URL, uploads directly to GCS via Uppy, then posts photo metadata. Server converts temporary URL to permanent `/objects/...` path and sets ACL policy.
- **Security**: Objects are private by default, access validated server-side.

### Key API Endpoints
- **Authentication**: `/api/auth/user`, `/api/login`, `/api/logout`
- **Sessions**: `/api/sessions`, `/api/sessions/:id` (POST, GET, DELETE)
- **Photos**: `/api/objects/upload` (POST), `/api/sessions/:id/photos` (POST, GET), `/api/photos/:id` (DELETE)
- **Analysis**: `/api/sessions/:id/analyze` (POST), `/api/sessions/:id/analysis` (GET)

## External Dependencies

### Third-Party Services
- **Google Cloud Storage**: For photo storage, integrated via `@google-cloud/storage`.
- **Neon Database**: Serverless PostgreSQL via `@neondatabase/serverless`.
- **Replit Authentication**: OIDC-based user authentication.

### Key Frontend Libraries
- **Radix UI**: Accessible UI primitives.
- **Uppy**: Modular file upload library.
- **TanStack Query**: Data fetching and caching.
- **Tailwind CSS**: Utility-first CSS framework.

### Machine Learning Libraries
- **@tensorflow/tfjs-node**: TensorFlow backend for Node.js (CPU-based ML inference).
- **@vladmandic/face-api**: Face detection and analysis library built on TensorFlow.js.
- **canvas**: Node.js canvas implementation for image processing.

### Development Infrastructure
- **TypeScript**: Full-stack type safety.
- **Vite**: Build tool for development and production.
- **Drizzle Kit**: Database migration tool.
- **ESBuild**: Bundles server code for production.

## Recent Changes (October 18, 2025)

### Album Feature ✅ (Latest)
- **Best Photos Gallery**: New `/album` page displays best photo from each analyzed session
- **Manual Selection Override**: Users can click any session to view all photos and select a different best photo
- **Photo Management**: Delete individual photos from sessions with confirmation dialog
- **Smart Behavior**: When best photo is deleted, session's bestPhotoId is cleared (left empty as requested)
- **Date Sorting**: Album displays sessions sorted by creation date (newest first)
- **Navigation**: Added "Album" link in Dashboard header, "Dashboard" link in Album header
- **Backend APIs**: 
  - GET /api/album: Returns sessions with best photos
  - PATCH /api/photos/:id/mark-best: Update which photo is marked as best
  - DELETE /api/photos/:id: Remove photo from session

### Face Count Consensus Selection ✅
- **Three-Tier Priority System**: Algorithm now uses face count consensus as Priority 0
- **Consensus Filter**: Only considers photos within 1 face of maximum detected count
- **Why It Matters**: Prevents selecting a "perfect" photo of only half the group
- **Example**: If max is 8 faces, photos with 7-8 faces are considered; 6 or fewer are excluded
- **Selection Flow**: Face count consensus → Eyes open count → Quality score (smiles + face quality)
- Updated RATING_SYSTEM.md with complete three-tier priority documentation

### Expressions Lost During Multi-Scale Detection Bug Fix 🔧
- **Issue**: Quality scores showing as NaN/null, all faces rated as "N/A" despite analysis completing
- **Root Cause**: When scaling detections back to original size, expressions were not preserved in the detection object
- **Fix**: Restored spread operator `...detection` to preserve all properties including expressions during multi-scale detection
- **Impact**: Quality scores now calculate correctly, face ratings populate properly

### Null Quality Score Frontend Fix 🔧
- **Issue**: Comparison page crashed with "null is not an object (evaluating 'face.qualityScore.toFixed')" error
- **Root Cause**: Previous failed analyses (from landmark scaling bug) stored null qualityScore values in database
- **Fix**: Added defensive null checks in comparison.tsx:
  - Updated TypeScript types to allow `qualityScore: number | null`
  - Display 'N/A' when qualityScore is null
  - Fixed photo sorting to handle null values (defaults to 0)
- **Impact**: Comparison page now handles legacy data gracefully without crashing

### Landmark Scaling Bug Fix 🔧
- **Issue**: Multi-scale detection was failing with "a.mul is not a function" error, causing all photos to score 0
- **Root Cause**: FaceLandmarks68 constructor expects Point objects with TensorFlow operations, but was receiving plain objects
- **Fix**: Changed landmark scaling to use `new faceapi.Point(x, y)` instead of plain `{ x, y }` objects
- **Impact**: Multi-scale face detection now works correctly, analysis completes successfully

### Multi-Scale Face Detection ✅
- **Enhanced Detection Coverage**: Implemented multi-scale face detection at 100%, 75%, and 50% scales
- **Comprehensive Face Discovery**: Catches faces of all sizes - large faces, small/distant faces, and medium faces
- **Duplicate Removal**: Uses IoU (Intersection over Union) threshold of 0.5 to merge duplicate detections
- **Better Group Photos**: Significantly improved detection for photos with people at varying distances
- ~3x processing time, but ensures all faces are discovered for accurate "best photo" selection

### Photo Selection Algorithm Update ✅
- **Eyes-First Priority**: Algorithm now prioritizes photos with maximum eyes open count
- **Smart Tiebreaking**: When multiple photos have same eyes open, uses quality score (smiles + face quality)
- **Example**: Photo with 4/4 eyes open and 2/4 smiling beats photo with 3/4 eyes open and 4/4 smiling
- Updated RATING_SYSTEM.md with two-tier priority system documentation

### Share All Photos + Rating Documentation ✅
1. **Share Buttons on All Photos**: Users can now share any photo, not just the AI-selected best one
   - All photos in comparison view have a share button
   - Best photo has filled button, others have outline variant
   - Uses native iOS/Android share sheet via Web Share API
2. **Rating System Documentation**: Created `RATING_SYSTEM.md` comprehensive guide
   - Documents face detection algorithm (SSD MobileNet v1)
   - Explains eye openness detection (EAR algorithm, threshold 0.22)
   - Details smile detection and expression analysis
   - Shows scoring formulas and recommendation levels
   - Technical implementation details and version history

### Face Detection Model Upgrade ✅
- **Switched from Tiny Face Detector to SSD MobileNet v1**
- Reason: Much better accuracy for group photos (detected only 1 face in 12-person photo with old model)
- Trade-off: ~2-3x slower analysis, but dramatically improved face detection
- Configuration: minConfidence: 0.5 (50% threshold)

### Eye Detection Threshold Tuning ✅
- Adjusted Eye Aspect Ratio (EAR) threshold multiple times for optimal accuracy:
  - Started at 0.20 (too lenient - false positives)
  - Increased to 0.25 (too strict - false negatives)
  - Tried 0.22 (still had false negatives on some open eyes)
  - Tried 0.20 (still missing some open eyes)
  - Tried 0.18 (still detecting open eyes as closed)
  - **Current: 0.15** (very lenient to minimize false negatives)
- Added debug logging to output actual EAR values for each eye to fine-tune threshold

### Deployment Dependencies Added ✅
- Added required Nix packages for TensorFlow.js and node-canvas deployment support:
  - cairo, pango, pixman, freetype, fontconfig, libjpeg, libpng, giflib, librsvg, zlib
- These native dependencies are required for @tensorflow/tfjs-node and canvas to work in production
- **Note**: Manual fix still required - Remove duplicate port configuration in `.replit` file (port 41501→3000) before publishing

### Simplified Analysis Workflow ✅
1. **Bypassed Face Selection**: Removed face preview/selection step to simplify user flow
2. **Direct Analysis**: Users now go directly from upload to analysis with one click
3. **Analysis Flow**: Dashboard → Upload Photos → "Analyze Photos" → View Results
4. **All Faces Analyzed**: Analysis now automatically processes all detected faces (no manual selection needed)

### Technical Changes
- Removed `/session/:sessionId/preview` route and FacePreview component from App.tsx
- Updated dashboard to call analyze endpoint directly without face selections
- Analysis endpoint's `faceSelections` parameter remains optional (defaults to analyzing all faces)
- Added analyze mutation with loading states and success/error handling
- Button text changed from "Select Faces & Analyze" to "Analyze Photos"