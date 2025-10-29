# Bulk Upload Optimization Plan

## Current Implementation Analysis

### Bottleneck Identified
**Line 270-271 in `BulkUploadComponent.tsx`**: Files are uploaded **sequentially** (one at a time):
```typescript
// Upload files sequentially to avoid overwhelming the server
for (const queuedFile of files) {
  const result = await uploadFile(queuedFile);
  // ...
}
```

### Current Flow Per File (Sequential)
1. Upload file to R2 (`/api/objects/upload`) - Network I/O
2. Create Photo record (`POST /api/sessions/${sessionId}/photos`) - Database write
3. Get presigned URL (`GET /api/objects/presigned-url`) - API call

**Total time**: Sum of all three operations × number of files
**Example**: If each file takes 2 seconds, 25 files = **50 seconds**

## Optimization Opportunities

### 1. Parallel Uploads with Concurrency Limit ⚡ **BIGGEST IMPACT**
**Current**: Upload files one at a time
**Optimized**: Upload 3-5 files simultaneously

**Impact**: 
- 25 files sequential: ~50 seconds
- 25 files parallel (5 at a time): ~10 seconds
- **5x speedup** for typical uploads

**Implementation**:
- Use `Promise.allSettled()` with batches
- Process batches concurrently
- Limit concurrency to 3-5 to avoid overwhelming server/network

### 2. Batch Database Operations 📊 **MEDIUM IMPACT**
**Current**: One API call per photo to create database record
**Optimized**: Batch create multiple photos in one API call

**Impact**:
- Reduces API calls from N to 1
- Reduces database round-trips
- **10-20% speedup** for high file counts

**Implementation**:
- Create `POST /api/sessions/:sessionId/photos/batch` endpoint
- Accept array of photos
- Use database batch insert

### 3. Combine Presigned URL Generation 🔗 **SMALL IMPACT**
**Current**: Get presigned URL separately after upload
**Optimized**: Return presigned URL in upload response

**Impact**:
- Reduces per-file API calls from 3 to 2
- **5-10% speedup**

**Implementation**:
- Modify `/api/objects/upload` to return presigned URL
- Or modify `/api/sessions/:sessionId/photos` to return presigned URL

### 4. Optimize Network Usage 🌐 **SMALL-MEDIUM IMPACT**
**Current**: Each upload creates new FormData
**Optimized**: Keep connections alive, optimize headers

**Impact**:
- Reduces connection overhead
- **5-10% speedup** for high file counts

## Recommended Implementation Priority

### Phase 1: Parallel Uploads (Highest Impact)
- Implement concurrent uploads with concurrency limit of 5
- Use `Promise.allSettled()` for error handling
- Monitor server load and adjust concurrency if needed

### Phase 2: Batch Database Operations
- Add batch photo creation endpoint
- Update frontend to batch API calls
- Test with various file counts

### Phase 3: Optimize API Responses
- Include presigned URLs in responses
- Reduce number of round-trips

## Expected Results

**Before Optimization**:
- 25 files × 2 seconds/file = **50 seconds**
- Limited by sequential processing

**After Phase 1 (Parallel Uploads)**:
- 25 files ÷ 5 concurrent × 2 seconds = **10 seconds**
- **5x faster** for typical uploads

**After All Phases**:
- ~8-9 seconds for 25 files
- **5-6x faster** overall

## Internet Speed Consideration

Your internet upload speed will always be the limiting factor:
- **50 Mbps upload**: ~6.25 MB/s = 1 MB file in ~0.16 seconds
- **10 Mbps upload**: ~1.25 MB/s = 1 MB file in ~0.8 seconds
- **1 Mbps upload**: ~0.125 MB/s = 1 MB file in ~8 seconds

**Parallel uploads help maximize bandwidth utilization** by:
- Keeping multiple connections active
- Reducing idle time between uploads
- Better utilizing available bandwidth

## Recommendation

**Start with Phase 1 (Parallel Uploads)** - This gives the biggest performance boost with minimal code changes and low risk.

