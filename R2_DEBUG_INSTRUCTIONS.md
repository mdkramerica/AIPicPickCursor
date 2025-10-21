# R2 "Access Denied" Troubleshooting

## The Issue
Uploads are reaching the server successfully with authentication, but failing with:
```
AccessDenied: Access Denied
at PutObjectCommand
```

## Root Cause
The R2 API token doesn't have write permissions to the bucket.

## Solution Steps

### 1. Check R2 API Token Permissions

1. Go to **Cloudflare Dashboard** → **R2** → **Manage R2 API Tokens**
2. Find token with Access Key: `2e517dab7bfa5669ef465a3ff4340163`
3. Verify it has these permissions:
   - [x] **Object Read**
   - [x] **Object Write** ← MUST BE CHECKED!
   - [x] **Object Delete** (optional but recommended)

### 2. If Token Lacks Write Permission

**Option A: Edit existing token** (if possible)
- Add Object Write permission
- Save changes

**Option B: Create new token**
1. Click "Create API Token"
2. Select permissions:
   - ✅ Object Read
   - ✅ Object Write
   - ✅ Object Delete (optional)
3. Restrict to specific bucket: `aipicpick-photos`
4. Create token
5. **SAVE THE SECRET KEY** - you can't see it again!

### 3. Verify R2 Endpoint Format

Current endpoint: `https://4b7607622ace1f9e67c694a247eb877e.r2`

This looks truncated. The correct format should be:
```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Check your Cloudflare R2 dashboard for the correct endpoint URL.

### 4. Update Railway Environment Variables

```bash
# If you created a new token:
railway variables set R2_ACCESS_KEY_ID="<new_access_key_id>"
railway variables set R2_SECRET_ACCESS_KEY="<new_secret_access_key>"

# If endpoint was wrong:
railway variables set R2_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
```

### 5. Verify the Fix

After updating variables, Railway will automatically redeploy. Then:
1. Try uploading a file
2. Check Railway logs: `railway logs`
3. Should see successful upload instead of "Access Denied"

## Additional Debug Info

**Current R2 Configuration:**
- Bucket: `aipicpick-photos`
- Access Key ID: `2e517dab7bfa5669ef465a3ff4340163`
- Endpoint: `https://4b7607622ace1f9e67c694a247eb877e.r2` (verify this!)

**What's Working:**
- ✅ Authentication (Kinde JWT)
- ✅ File upload to server (multipart/form-data)
- ✅ File received by server (buffer created)

**What's Failing:**
- ❌ PutObjectCommand to R2 → "Access Denied"

This confirms it's purely an R2 permissions issue, not application code.
