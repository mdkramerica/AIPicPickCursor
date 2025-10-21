# Fix R2 CORS Configuration for Photo Display

## Problem
Photos are uploading to R2 successfully and presigned URLs are being generated correctly, but images don't display in the browser because R2 bucket CORS is not configured.

## Evidence from Logs
- ✅ Photos uploaded: 5 files uploaded successfully
- ✅ Presigned URLs generated: "📊 Presigned URL generation complete: 5 success, 0 failed"
- ✅ Frontend receiving URLs: "📸 Loaded presigned URLs for 5 photos"
- ❌ Images not displaying in browser

## Solution: Configure CORS on R2 Bucket

### Step 1: Log into Cloudflare Dashboard
1. Go to https://dash.cloudflare.com
2. Navigate to R2 Object Storage
3. Select your bucket: `ai-pic-pick`

### Step 2: Add CORS Policy
1. Click on "Settings" tab
2. Scroll down to "CORS Policy"
3. Click "Add CORS Policy"
4. Add the following configuration:

```json
[
  {
    "AllowedOrigins": [
      "https://aipicpick-production.up.railway.app",
      "http://localhost:5173",
      "http://localhost:5000"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD",
      "OPTIONS"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Type"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### Step 3: Save and Test
1. Click "Save"
2. Wait 1-2 minutes for changes to propagate
3. Reload your app: https://aipicpick-production.up.railway.app
4. Photos should now display!

## Why This Fixes It

- **CORS (Cross-Origin Resource Sharing)** is required when a browser loads resources from a different domain
- Your app is hosted on `aipicpick-production.up.railway.app`
- Your images are hosted on `ai-pic-pick.4b7607622ace1f9e67c694a247eb877e.r2.cloudflarestorage.com`
- Without CORS headers, browsers block the images for security reasons

## Alternative: Use R2 Custom Domain (Optional)

Instead of using presigned URLs, you can:

1. Set up a custom domain for R2 (e.g., `cdn.aipicpick.com`)
2. Make the bucket public
3. Serve images directly without presigned URLs

This is simpler but less secure. The presigned URL approach is better for private user photos.

## Verification

After configuring CORS, check the browser console:
- Open DevTools (F12)
- Go to Network tab
- Reload the page
- Click on an image request
- Check Response Headers - you should see:
  ```
  access-control-allow-origin: https://aipicpick-production.up.railway.app
  ```

If you see this header, CORS is configured correctly and images will display!

## Chrome-Specific Troubleshooting

If images work on Safari/iOS but NOT on Chrome desktop:

### 1. Clear Chrome Cache
Chrome caches CORS errors aggressively:
- Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac) for hard refresh
- Or: DevTools > Network tab > Check "Disable cache" > Reload

### 2. Try Chrome Incognito Mode
Test in Incognito to bypass:
- Browser extensions (ad blockers, privacy tools)
- Cached CORS errors
- Service workers

### 3. Check Chrome Console for CORS Errors
Look for messages like:
```
Access to image at 'https://...' from origin 'https://...' has been blocked by CORS policy
```

### 4. Verify CORS Preflight (OPTIONS) Request
Chrome sends OPTIONS requests before GET:
- Go to Network tab in DevTools
- Look for OPTIONS requests to R2 URLs
- These should return 200 OK with CORS headers
- If OPTIONS fails, images won't load

### 5. Updated CORS Policy for Chrome
The updated policy above includes:
- `OPTIONS` method (required for Chrome preflight)
- Additional `ExposeHeaders` (Content-Length, Content-Type)
- These may be required for Chrome's stricter CORS enforcement
