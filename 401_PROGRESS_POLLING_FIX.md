# 401 Unauthorized Error Fix for Progress Polling

## Problem
During bulk upload grouping analysis, progress polling was getting 401 Unauthorized errors repeatedly. The polling continued even after authentication failures, causing console spam and poor user experience.

## Root Causes
1. **Token Expiration**: Long-running operations (grouping can take minutes) can cause JWT tokens to expire mid-operation
2. **No 401 Handling**: Progress polling didn't check for 401 errors and stop gracefully
3. **Invalid Navigation**: After grouping started, navigation attempted to go to `/sessions/:sessionId/groups` which doesn't exist

## Solution

### 1. Enhanced Progress Polling Error Handling (`client/src/pages/dashboard.tsx`)
- Added check for `isUnauthorizedError()` in progress polling catch block
- Stop polling immediately when 401 detected
- Show user-friendly toast message about session expiration
- Redirect to login after 2 second delay

```typescript
} catch (error) {
  console.error('❌ Error polling progress:', error);
  
  // Stop polling on 401 (unauthorized) - token expired
  if (isUnauthorizedError(error as Error)) {
    console.warn('⚠️ Token expired during progress polling, stopping');
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    
    toast({
      title: "Session expired",
      description: "Your session expired. Please refresh the page and try again.",
      variant: "destructive",
    });
    
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 2000);
    
    return; // Exit early to prevent further polling
  }
}
```

### 2. Fixed Navigation (`client/src/pages/bulk-upload.tsx`)
- Changed navigation from non-existent `/sessions/${sessionId}/groups` to `/` (dashboard)
- Added comment explaining that grouping happens on server and results can be viewed in dashboard

## Impact
- ✅ Prevents infinite 401 error spam in console
- ✅ Provides clear user feedback when session expires
- ✅ Gracefully handles token expiration during long operations
- ✅ Fixes broken navigation after grouping starts

## Testing
1. Start a bulk upload and grouping analysis
2. Wait for grouping to start (it can take several minutes)
3. If token expires during grouping, polling should stop gracefully and redirect to login
4. Verify navigation goes to dashboard instead of non-existent route

## Future Improvements
- Consider implementing token refresh mechanism before it expires
- Add retry logic for transient network errors (non-401)
- Implement exponential backoff for polling intervals




