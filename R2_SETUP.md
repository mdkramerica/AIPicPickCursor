# Cloudflare R2 Storage Setup

This application uses Cloudflare R2 (S3-compatible storage) for storing uploaded photos.

## Why R2?

- **Free tier**: 10GB storage, unlimited egress
- **S3-compatible**: Works with standard AWS SDK
- **No egress fees**: Unlike AWS S3
- **Fast**: Cloudflare's global network

## Setup Instructions

### 1. Create a Cloudflare R2 Bucket

1. Go to https://dash.cloudflare.com/
2. Navigate to **R2** in the sidebar
3. Click **Create bucket**
4. Name your bucket (e.g., `aipicpick-photos`)
5. Click **Create bucket**

### 2. Generate R2 API Credentials

1. In R2 dashboard, click **Manage R2 API Tokens**
2. Click **Create API Token**
3. Choose **Object Read & Write** permissions
4. Select your bucket or choose "All buckets"
5. Click **Create API Token**
6. **Save these credentials** - you'll need them:
   - Access Key ID
   - Secret Access Key
   - Endpoint URL (looks like: `https://[account-id].r2.cloudflarestorage.com`)

### 3. Configure Environment Variables

Add these to your `.env` file (local) and Railway environment variables (production):

```bash
# Cloudflare R2 Storage
R2_ENDPOINT=https://[your-account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_BUCKET_NAME=aipicpick-photos
```

### 4. Test the Setup

1. Restart your development server
2. Try uploading a photo
3. Check your R2 bucket dashboard to see if files appear

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `R2_ENDPOINT` | R2 endpoint URL for your account | `https://abc123.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token access key | `a1b2c3d4e5...` |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret | `xyz789...` |
| `R2_BUCKET_NAME` | Name of your R2 bucket | `aipicpick-photos` |

## Production Deployment (Railway)

1. In Railway dashboard, go to your service
2. Click **Variables** tab
3. Add the four R2 environment variables listed above
4. Railway will automatically redeploy with the new configuration

## Troubleshooting

### "R2 credentials not configured" error
- Make sure all four environment variables are set
- Check that there are no typos in variable names
- Restart your server after adding variables

### "Access Denied" errors
- Verify your API token has Read & Write permissions
- Check that the bucket name matches exactly
- Ensure the API token has access to your specific bucket

### Files not appearing in bucket
- Check the R2 dashboard under your bucket's **Objects** tab
- Files are stored in the `uploads/` folder with UUID names
- Verify the upload was successful by checking browser console

## File Structure

Files are organized in R2 as:
```
/uploads/
  ├── [uuid-1]  # Photo file 1
  ├── [uuid-2]  # Photo file 2
  └── ...
```

Each file is identified by a UUID and stored with its original content type.

## Cost Estimate

Cloudflare R2 Free Tier:
- **Storage**: 10 GB/month
- **Class A operations**: 1 million requests/month (writes, lists)
- **Class B operations**: 10 million requests/month (reads)
- **Egress**: Unlimited (free!)

For a typical photo app:
- Average photo size: 2-5 MB
- Free tier accommodates: ~2,000-5,000 photos
- Perfect for personal use or small user base

## Security Notes

- Files are stored with private access by default
- Access is controlled via presigned URLs with expiration
- Only authenticated users can upload files
- Object keys are UUIDs to prevent guessing

## Migration from Replit Storage

If you previously used Replit's object storage:
1. This code completely replaces Replit storage
2. Old files in Replit storage will not be accessible
3. Start fresh with R2 - no migration needed
4. All new uploads will go to R2
