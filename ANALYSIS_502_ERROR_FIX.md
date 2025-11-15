# Analysis 502 Error Fix Plan

## Problem Diagnosis

**Error**: 502 "Application failed to respond" when analyzing photos in non-bulk session
**Endpoint**: `/api/sessions/:sessionId/analyze` and `/api/sessions/:sessionId/progress`

**Root Causes**:

1. **Request Timeout**: Railway likely has a request timeout (30-60 seconds). The analyze endpoint waits for ALL photos to complete before returning, which can exceed the timeout.

2. **Missing Error Handling**: If `analyzeSession` throws an unhandled error during parallel processing, it could crash the process before `asyncHandler` catches it.

3. **No Error Progress Tracking**: If analysis fails mid-way, progress is never updated to "error" status, so the endpoint might hang.

4. **Memory/Resource Exhaustion**: Parallel analysis (3 concurrent) might exhaust memory or CPU, causing Railway to kill the process.

## Current Flow Issues

1. **Synchronous blocking**: The `/analyze` endpoint waits for entire analysis to complete before returning response
2. **No timeout handling**: Long-running analysis hits Railway timeout
3. **Progress not updated on error**: If analysis crashes, progress store might be in inconsistent state
4. **No graceful degradation**: If analysis fails, there's no fallback

## Solution

### 1. Enhanced Error Handling in analyzeSession
- Wrap entire analysis in try-catch
- Always emit error progress if analysis fails
- Ensure progress is updated even on failure

### 2. Add Timeout Handling
- Set Railway-compatible timeout (if analysis takes >30s, return progress + continue in background)
- Or make analysis async (fire-and-forget, return immediately)

### 3. Improve Progress Error States
- Emit "error" progress if analysis fails
- Clear progress on error so polling endpoint doesn't hang

### 4. Add Request Timeout Protection
- Use `Promise.race()` with timeout
- Return 202 Accepted if analysis takes too long
- Continue analysis in background with progress updates

## Recommended Implementation

**Option A: Fire-and-Forget Analysis (Recommended)**
- `/analyze` endpoint returns immediately with 202 Accepted
- Analysis runs in background
- Progress polling shows updates
- More Railway-friendly (no long-running requests)

**Option B: Enhanced Error Handling**
- Keep synchronous but add comprehensive error handling
- Add timeout wrapper
- Always update progress on error
- Better error messages

I recommend **Option A** for Railway compatibility, but will implement **Option B** first as it's less disruptive.




