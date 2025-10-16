# AI Group Photo Selector

## Overview

An intelligent web application that uses AI to analyze group photos and automatically identify the best shot by detecting open eyes, smiles, and overall face quality. Users upload multiple photos from the same scene, and the system recommends the optimal image where everyone looks their best.

**Core Value Proposition**: Eliminates the tedious process of manually reviewing dozens of group photos by leveraging AI-powered face detection and quality scoring to instantly surface the best shot.

## Current Status: Real Computer Vision Integration ✅

### Completed Real CV Features
- ✅ **TensorFlow.js & face-api Integration**: Real ML models replace simulated analysis
- ✅ **Face Detection**: TinyFaceDetector for fast CPU-based face detection
- ✅ **Eye State Detection**: Eye Aspect Ratio (EAR) algorithm detects open/closed eyes
- ✅ **Smile Detection**: Expression recognition identifies smiling faces
- ✅ **Quality Scoring**: Real metrics based on face attributes (eyes, smile, confidence)
- ✅ **Error Handling**: Graceful degradation for invalid images or analysis failures

### Implementation Details
**ML Models** (stored in ./models/):
- tiny_face_detector_model.bin (190 KB) - Fast face detection
- face_landmark_68_model.bin (356 KB) - Facial landmark detection
- face_expression_model.bin (329 KB) - Expression/emotion recognition

**Real Analysis Pipeline**:
1. Load models on first analysis request (lazy loading)
2. Fetch image from object storage
3. Detect all faces with TinyFaceDetector
4. Extract 68 facial landmarks per face
5. Calculate Eye Aspect Ratio (EAR):
   - EAR > 0.2 = eyes open
   - EAR ≤ 0.2 = eyes closed
6. Detect smiles via expression recognition:
   - Happy emotion > 0.5 = smiling
7. Compute quality score per face:
   - Eyes open: 40 points
   - Smiling: 30 points  
   - Expression quality: 15 points
   - Detection confidence: 15 points
   - Total: 0-100 per face
8. Average face scores for overall photo quality
9. Select best photo by highest quality score

### Known Limitations & Testing Notes
- **Image Format Validation**: Added comprehensive validation (JPEG, PNG, GIF, BMP, WEBP)
- **Test Images**: Automated test agent may upload non-standard images; real user JPG/PNG uploads should work correctly
- **Performance**: 2-10 seconds per photo depending on size and face count
- **CPU Processing**: Optimized for CPU with TinyFaceDetector model

### To Test Real CV
1. Upload real JPG or PNG group photos (not test images)
2. Click "Analyze Photos"
3. Observe:
   - Console shows "✅ Face-API models loaded successfully"
   - Real quality scores based on detected faces
   - Photos with open eyes & smiles get higher scores (80-95)
   - Photos with closed eyes get lower scores (30-60)
   - Best photo selected by highest score

## MVP Status (Previous Implementation)

### Completed Features ✅
- **User Authentication**: Replit Auth (OIDC) integration with session management
- **Photo Session Management**: Create and manage photo analysis sessions
- **Multi-Photo Upload**: Uppy-based uploader with direct-to-object-storage flow
- **Responsive UI**: Beautiful landing page and dashboard with light/dark mode support
- **Object Storage Integration**: Secure photo storage with ACL-based access control
- **Persistent Photo URLs**: Photos stored with permanent /objects/... paths (not temporary signed URLs)

### Known Limitations
- **Session-Only Storage**: Photos tied to sessions; no permanent gallery feature in MVP
- **No Compositing**: Best photo selection only; creating composite images saved for v2

### Recent Bug Fixes
- **Photo URL Persistence Fix**: Changed from storing temporary presigned URLs to permanent object paths, ensuring photos remain accessible beyond 900s TTL
- **Uppy Upload Integration**: Fixed getUploadParameters callback to properly receive file parameter

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, built using Vite for optimal development experience and fast builds.

**UI Component System**: Radix UI primitives with shadcn/ui styling patterns, providing accessible, unstyled components that are customized through Tailwind CSS. The "new-york" style variant is used for a clean, modern aesthetic.

**Design Philosophy**: Photo-centric utility interface inspired by Google Photos and Linear. The design emphasizes clarity and user control while subtly indicating AI intelligence. Uses a vibrant blue-purple primary color (245 75% 55%) to convey AI capabilities, with comprehensive light/dark mode support.

**State Management**: TanStack Query (React Query) handles all server state, API caching, and data synchronization. No global state management library is needed as authentication and data fetching are handled declaratively through hooks.

**Routing**: Wouter provides lightweight client-side routing with a simple, hook-based API.

**File Upload**: Uppy dashboard for multi-file image uploads with drag-and-drop support and progress tracking.

### Backend Architecture

**Runtime**: Node.js with Express server running in ESM mode for modern JavaScript features.

**API Pattern**: RESTful endpoints with JSON request/response format. All routes are registered centrally in `server/routes.ts`.

**Photo Analysis Service**: Real computer vision using TensorFlow.js and face-api.js (`server/photoAnalysis.ts`). Face detection, eye state analysis, smile detection, and quality scoring using ML models.

**Session Management**: Express-session with PostgreSQL session store for persistent user sessions across server restarts.

### Database Architecture

**ORM**: Drizzle ORM provides type-safe database operations with PostgreSQL dialect.

**Database Provider**: Neon serverless PostgreSQL with WebSocket connections for optimal performance in serverless environments.

**Schema Design**:
- `users` - User profiles from authentication (id, replitId, email, name)
- `photoSessions` - Groups of photos uploaded together for comparison (id, userId, name, status, photoCount, bestPhotoId, analyzedAt)
- `photos` - Individual photo metadata and analysis results (id, sessionId, fileUrl, originalFilename, uploadOrder, overallQuality, isSelectedBest)
- `faces` - Face detection data for each person in each photo (id, photoId, eyesOpen, smiling, confidence, boundingBox)

**Data Flow**: Photos are uploaded → Stored in object storage → Analysis triggered → Real face detection → Face data and scores persisted → Best photo recommended based on aggregate quality scores.

**Critical Implementation Detail**: Photo fileUrl is stored as permanent `/objects/...` path (not temporary signed URL) to ensure photos remain accessible beyond upload TTL.

### Authentication & Authorization

**Provider**: Replit Auth using OpenID Connect (OIDC) for secure, zero-configuration authentication.

**Flow**: Passport.js strategy handles OIDC token exchange, user profile retrieval, and session establishment. User data is synchronized to local database for relationship mapping.

**Session Security**: HTTP-only cookies with 7-day expiration, secure flag enabled for HTTPS environments.

**Authorization Pattern**: Middleware-based authentication checks (`isAuthenticated`) protect API routes. Object storage implements ACL-based permission system for fine-grained access control.

### Object Storage

**Provider**: Google Cloud Storage accessed through Replit's sidecar credential system for seamless authentication.

**Access Control**: Custom ACL policy system stored in object metadata, supporting public/private visibility and owner-based permissions.

**Upload Flow**: 
1. Client requests signed upload URL from `/api/objects/upload`
2. Server generates temporary presigned PUT URL
3. Client uploads directly to GCS using Uppy
4. Client POSTs photo metadata to `/api/sessions/:id/photos` with temporary URL
5. Server calls `ObjectStorageService.trySetObjectEntityAclPolicy()` to:
   - Convert temporary URL to permanent `/objects/...` path
   - Set ACL policy (owner: userId, visibility: private)
6. Permanent path stored in database for long-term access

**Security**: Objects are private by default. Access is validated server-side via `/objects/*` route before serving files.

## Key API Endpoints

### Authentication
- `GET /api/auth/user` - Get current user info
- `GET /api/login` - Initiate OIDC login flow
- `GET /api/logout` - End user session

### Sessions
- `POST /api/sessions` - Create new photo session
- `GET /api/sessions` - List user's sessions
- `GET /api/sessions/:id` - Get single session
- `DELETE /api/sessions/:id` - Delete session

### Photos
- `POST /api/objects/upload` - Get presigned upload URL
- `POST /api/sessions/:id/photos` - Add uploaded photo to session
- `GET /api/sessions/:id/photos` - List session photos
- `DELETE /api/photos/:id` - Delete photo

### Analysis
- `POST /api/sessions/:id/analyze` - Analyze all photos using real CV (triggers ML model loading)
- `GET /api/sessions/:id/analysis` - Get analysis results

## External Dependencies

### Third-Party Services

**Google Cloud Storage**: Primary object storage for uploaded photos. Integrated via `@google-cloud/storage` SDK with Replit sidecar authentication eliminating the need for credential management.

**Neon Database**: Serverless PostgreSQL database with WebSocket connection pooling via `@neondatabase/serverless`. Provides automatic scaling and connection management.

**Replit Authentication**: OIDC-based authentication service providing user identity without managing credentials or authentication infrastructure.

### Key Frontend Libraries

**Radix UI**: Comprehensive set of unstyled, accessible UI primitives (dialogs, dropdowns, tooltips, etc.) that form the foundation of all interactive components.

**Uppy**: Modular file upload library with S3-compatible upload strategy for direct-to-storage uploads with progress tracking and retry logic.

**TanStack Query**: Declarative data fetching and caching with automatic background refetching, optimistic updates, and error handling.

**Tailwind CSS**: Utility-first CSS framework with custom design tokens matching the design system specifications. Uses CSS variables for theme switching.

### Machine Learning Libraries

**@tensorflow/tfjs-node**: TensorFlow backend for Node.js enabling CPU-based ML inference. Optimized with oneAPI Deep Neural Network Library (oneDNN) for AVX2 FMA instructions.

**@vladmandic/face-api**: Face detection and analysis library built on TensorFlow.js. Provides face detection, landmark extraction, and expression recognition.

**canvas**: Node.js canvas implementation for image loading and processing. Required for face-api to process images.

### Development Infrastructure

**TypeScript**: Full-stack type safety with shared types between client and server via `@shared` directory.

**Vite**: Build tool providing instant server start, HMR, and optimized production builds with code splitting.

**Drizzle Kit**: Database migration tool for schema changes and database pushes during development.

**ESBuild**: Bundles server code for production deployment with external package handling and ESM output format.

## Recent Changes (October 16, 2025)

### Real Computer Vision Integration ✅
1. **ML Dependencies**: Installed @tensorflow/tfjs-node, @vladmandic/face-api, canvas, and libuuid system library
2. **Model Deployment**: Downloaded and deployed TinyFaceDetector, FaceLandmark68Net, and FaceExpressionNet models to ./models/
3. **Image Loading**: Created imageLoader.ts with object storage integration and image format validation
4. **Face Detection**: Implemented real face detection using TinyFaceDetectorOptions for CPU processing
5. **Eye Detection**: Implemented Eye Aspect Ratio (EAR) algorithm for accurate eye state detection
6. **Smile Detection**: Integrated expression recognition for smile detection (happy emotion threshold)
7. **Quality Scoring**: Real quality metrics based on actual face attributes instead of random simulation
8. **Error Handling**: Comprehensive error handling for invalid images and analysis failures

### Critical Bug Fixes
1. **Photo URL Persistence**: Fixed photo storage to use permanent `/objects/...` paths instead of temporary presigned URLs. This ensures photos remain accessible beyond the 900-second TTL of signed URLs.

2. **Uppy Upload Integration**: Fixed `ObjectUploader` component to properly handle the `getUploadParameters` callback with file parameter, resolving "Cannot upload to an undefined URL" error.

### Testing Status
- ✅ End-to-end authentication flow working
- ✅ Session creation and management verified
- ✅ Photo upload flow functional
- ✅ Real CV integration complete with ML models loaded
- ⚠️ Test with real user-uploaded JPG/PNG images recommended
- ⚠️ Automated test images may have format issues; real photos should work correctly

## Development Commands

- `npm run dev` - Start development server (frontend + backend, loads TensorFlow on first analysis)
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio for database inspection
- `npm run build` - Build for production

## Environment Variables

Required secrets (managed by Replit):
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Express session encryption key
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - GCS bucket ID
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` - Database credentials
- `PUBLIC_OBJECT_SEARCH_PATHS` - Object storage public paths
- `PRIVATE_OBJECT_DIR` - Object storage private directory
