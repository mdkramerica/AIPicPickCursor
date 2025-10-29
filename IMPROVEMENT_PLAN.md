# AIPicPick Improvement Plan - Action Items

## Quick Reference: Priority Matrix

| Priority | Issue | Impact | Effort | Timeline |
|----------|-------|--------|--------|----------|
| 🔴 CRITICAL | Pagination Missing | High | 12-16h | Week 1-2 |
| 🔴 CRITICAL | Synchronous Analysis | High | 16-24h | Week 1-3 |
| 🔴 CRITICAL | N+1 Query in Album | High | 4-6h | Week 1 |
| 🟡 IMPORTANT | No Caching | Medium | 8-12h | Month 1-2 |
| 🟡 IMPORTANT | No Thumbnails | Medium | 12-16h | Month 1-2 |
| 🟡 IMPORTANT | Large Bundle | Medium | 6-8h | Month 1-2 |
| 🟢 ENHANCEMENT | Redis Rate Limiting | Low | 8-12h | Month 2-3 |
| 🟢 ENHANCEMENT | Test Suite | Low | 40-60h | Month 3-6 |

---

## Phase 1: Critical Fixes (Weeks 1-3)

### 1. Implement Pagination ✅ HIGH PRIORITY
**Files to Modify**:
- `server/storage.ts` - Add pagination methods
- `server/routes.ts` - Update endpoints: `/api/sessions`, `/api/sessions/:id/photos`
- `client/src/pages/dashboard.tsx` - Add pagination UI
- `client/src/components/ui/pagination.tsx` - Create pagination component

**Implementation Steps**:
1. Add `getSessionsByUser(userId, { limit, offset })` to storage
2. Add `getPhotosBySession(sessionId, { limit, offset })` to storage
3. Update routes to accept `?page=1&limit=20` query params
4. Return pagination metadata: `{ data, pagination: { page, limit, total, totalPages } }`
5. Add pagination controls to frontend

**Test Cases**:
- Pagination with 100+ sessions
- Pagination with 50+ photos per session
- Edge cases: page 0, negative numbers, > total pages

---

### 2. Fix N+1 Query in Album Endpoint ✅ HIGH PRIORITY
**File**: `server/routes.ts` (Line ~709)

**Current Code**:
```typescript
app.get("/api/album", async (req, res) => {
  const sessions = await storage.getSessionsByUser(userId);
  const albumData = await Promise.all(
    sessions.map(async (session) => {
      const photos = await storage.getPhotosBySession(session.id); // N+1!
      const bestPhoto = photos.find(p => p.isSelectedBest);
      return { session, bestPhoto };
    })
  );
});
```

**Fixed Code**:
```typescript
app.get("/api/album", async (req, res) => {
  const albumData = await db
    .select({
      session: photoSessions,
      photo: photos,
    })
    .from(photoSessions)
    .leftJoin(photos, and(
      eq(photos.sessionId, photoSessions.id),
      eq(photos.isSelectedBest, true)
    ))
    .where(eq(photoSessions.userId, userId))
    .orderBy(desc(photoSessions.createdAt));
  
  // Group by session
  const grouped = albumData.reduce((acc, row) => {
    if (!acc[row.session.id]) {
      acc[row.session.id] = { session: row.session, bestPhoto: null };
    }
    if (row.photo) {
      acc[row.session.id].bestPhoto = row.photo;
    }
    return acc;
  }, {});
  
  res.json(Object.values(grouped));
});
```

**Expected Improvement**: 100 sessions = 1 query instead of 101 queries

---

### 3. Background Job Queue for Analysis ✅ HIGH PRIORITY
**New Files**:
- `server/jobs/analysisQueue.ts` - BullMQ queue setup
- `server/jobs/analysisWorker.ts` - Worker that processes jobs
- `server/jobs/types.ts` - Job type definitions

**Dependencies to Add**:
```json
{
  "bullmq": "^5.x",
  "ioredis": "^5.x"
}
```

**Implementation Steps**:
1. Create Redis connection
2. Create analysis queue
3. Create worker to process jobs
4. Update `/api/sessions/:id/analyze` to enqueue job instead of running directly
5. Use existing `/api/sessions/:id/progress` endpoint for status updates
6. Emit progress updates from worker

**Worker Code Structure**:
```typescript
const worker = new Worker('photo-analysis', async (job) => {
  const { sessionId, userId } = job.data;
  
  // Update progress via existing progress store
  photoAnalysisService.emitProgress({
    sessionId,
    status: 'analyzing',
    percentage: 0,
    // ...
  });
  
  const result = await photoAnalysisService.analyzeSession(sessionId, ...);
  
  // Update progress complete
  photoAnalysisService.emitProgress({
    sessionId,
    status: 'complete',
    percentage: 100,
  });
  
  return result;
});
```

**Environment Variables**:
```bash
REDIS_URL=redis://localhost:6379  # or Railway Redis URL
```

---

### 4. Standardize Error Handling ✅ MEDIUM PRIORITY
**File**: `server/routes.ts`

**Find all routes using try-catch**:
- Line 385-404: `/api/sessions/:sessionId/photos` GET
- Line 464-508: `/api/sessions/:sessionId/photos` POST
- Line 603-706: `/api/sessions/:sessionId/analyze`
- Line 709-812: `/api/album` and others

**Replace Pattern**:
```typescript
// BEFORE
app.get("/api/route", async (req, res) => {
  try {
    // ...
  } catch (error) {
    res.status(500).json({ message: "Failed" });
  }
});

// AFTER
app.get("/api/route", isAuthenticated, asyncHandler(async (req, res) => {
  // No try-catch needed - asyncHandler catches errors
  // ...
}));
```

---

## Phase 2: Performance Optimizations (Month 1-2)

### 5. Add Redis Caching Layer
**New File**: `server/cache.ts`

**Cache Strategy**:
- Session lists: 5 min TTL
- Photo lists: 5 min TTL  
- Analysis results: 1 hour TTL
- Presigned URLs: 55 min TTL

**Implementation**:
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const data = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}
```

**Usage**:
```typescript
const sessions = await getCached(
  `sessions:${userId}`,
  () => storage.getSessionsByUser(userId),
  300 // 5 min
);
```

---

### 6. Generate Image Thumbnails
**New Dependency**: `sharp`

**Implementation**:
```typescript
import sharp from 'sharp';

async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// In upload route
const thumbnail = await generateThumbnail(fileBuffer);
const thumbnailKey = `${objectKey}-thumb`;
await r2Storage.uploadFile(thumbnail, 'image/jpeg', thumbnailKey);
```

**Database**: Add `thumbnailUrl` column to photos table

**Frontend**: Use thumbnail for grid, full image on click

---

### 7. Frontend Code Splitting
**File**: `vite.config.ts`

**Update**:
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            // ... other Radix UI
          ],
          'query-vendor': ['@tanstack/react-query'],
        }
      }
    }
  }
});
```

**Lazy Load Pages**:
```typescript
// App.tsx
const Dashboard = lazy(() => import('@/pages/dashboard'));
const BulkUpload = lazy(() => import('@/pages/bulk-upload'));

<Suspense fallback={<LoadingSpinner />}>
  <Dashboard />
</Suspense>
```

---

## Phase 3: Enhancements (Month 2-3)

### 8. Redis Rate Limiting
**File**: `server/middleware/rateLimiter.ts`

**Replace in-memory store with Redis**:
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

class RedisRateLimiter {
  async checkLimit(key: string, windowMs: number, maxRequests: number) {
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    
    return count <= maxRequests;
  }
}
```

---

### 9. Add Health Check Endpoint
**File**: `server/routes.ts`

```typescript
app.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    database: await checkDatabaseHealth(),
    storage: await checkR2Health(),
  };
  
  const healthy = checks.database && checks.storage;
  res.status(healthy ? 200 : 503).json(checks);
});
```

---

## Phase 4: Quality Improvements (Month 3-6)

### 10. Comprehensive Test Suite
**Setup**:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

**Test Structure**:
```
tests/
├── unit/
│   ├── storage.test.ts
│   ├── photoAnalysis.test.ts
│   └── validators.test.ts
├── integration/
│   ├── api.sessions.test.ts
│   ├── api.photos.test.ts
│   └── auth.test.ts
└── e2e/
    ├── upload-flow.spec.ts
    └── analysis-flow.spec.ts
```

**Example Test**:
```typescript
// tests/integration/api.sessions.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index';

describe('GET /api/sessions', () => {
  it('should require authentication', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(401);
  });
  
  it('should return paginated sessions', async () => {
    const token = await getAuthToken();
    const res = await request(app)
      .get('/api/sessions?page=1&limit=20')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(20);
  });
});
```

---

## Implementation Checklist

### Week 1
- [ ] Implement pagination on `/api/sessions`
- [ ] Implement pagination on `/api/sessions/:id/photos`
- [ ] Fix N+1 query in `/api/album`
- [ ] Add pagination UI components

### Week 2-3
- [ ] Set up Redis (Railway or local)
- [ ] Create analysis queue and worker
- [ ] Update analyze endpoint to use queue
- [ ] Test background job processing

### Month 1
- [ ] Add Redis caching layer
- [ ] Implement thumbnail generation
- [ ] Add code splitting to frontend
- [ ] Add health check endpoint

### Month 2-3
- [ ] Migrate rate limiting to Redis
- [ ] Add CSRF protection
- [ ] Implement soft deletes
- [ ] Add transaction support

### Month 3-6
- [ ] Set up test framework
- [ ] Write unit tests (40% coverage)
- [ ] Write integration tests (critical paths)
- [ ] Set up CI/CD with tests

---

## Success Metrics

### Performance Targets
- **Pagination**: <100ms response time (vs 2-5s currently)
- **Analysis**: <5s to queue (vs 30-60s blocking)
- **Album Load**: <500ms (vs 2-10s currently)
- **Bundle Size**: <300KB initial (vs 571KB currently)

### Scalability Targets
- **Support**: 1,000+ concurrent users
- **Database**: Handle 10,000+ sessions per user
- **Photos**: Process 100+ photos per session
- **Storage**: Handle 1M+ photos total

---

## Resources & Dependencies

### New Dependencies Needed
```json
{
  "dependencies": {
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.0",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "playwright": "^1.40.0"
  }
}
```

### Infrastructure Needs
- **Redis**: Required for Phase 1 (background jobs) and Phase 2 (caching)
  - Railway Redis addon: ~$5/month
  - Or self-hosted: Free

---

## Quick Wins (Low Effort, High Impact)

1. **Add Health Check** (2 hours) - Essential for monitoring
2. **Fix N+1 Query** (4 hours) - Immediate performance boost
3. **Standardize Error Handling** (2 hours) - Better maintainability
4. **Add Pagination to Sessions** (6 hours) - Prevents timeout issues

**Total Quick Wins**: ~14 hours, huge impact

---

**Last Updated**: January 2025  
**Next Review**: After Phase 1 completion

