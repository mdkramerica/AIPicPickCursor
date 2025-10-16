# AI Group Photo Selector

## Overview
The AI Group Photo Selector is an intelligent web application designed to simplify the process of choosing the best group photo. It leverages AI-powered computer vision to analyze multiple photos from the same scene, identifying the optimal shot by detecting open eyes, smiles, and overall face quality. The primary purpose is to eliminate manual photo review, offering users an instant recommendation for the picture where everyone looks their best.

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

## Recent Changes (October 16, 2025)

### Deployment Dependencies Added ✅ (Latest)
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