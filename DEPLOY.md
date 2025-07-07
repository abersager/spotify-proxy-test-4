# 🚀 Deployment Guide

## Quick Deploy (2 minutes)

### Option 1: GitHub Template (Easiest)

1. **Create your repository**
   - Click [Use this template](https://github.com/abersager/spotify-proxy/generate)
   - Choose a repository name (e.g., `my-spotify-proxy`)

2. **Get Cloudflare credentials**
   - Account ID: [Cloudflare Dashboard](https://dash.cloudflare.com) → Copy from sidebar
   - API Token: [Create Token](https://dash.cloudflare.com/profile/api-tokens) → "Edit Cloudflare Workers"

3. **Deploy via GitHub Actions**
   - Go to **Actions** tab in your new repository
   - Click **Manual Deploy** workflow
   - Click **Run workflow**
   - Enter your Cloudflare credentials
   - Choose a worker name (optional)
   - Click **Run workflow**

4. **Setup your proxy**
   - Visit your worker URL (shown in deployment logs)
   - Enter your Spotify app credentials
   - Complete OAuth authorization
   - Start using your API!

### Option 2: Direct Deploy Button

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/abersager/spotify-proxy)

Click the button above and follow the prompts.

## What You'll Need

### Cloudflare Account (Free)
- Account ID from dashboard
- API Token with Workers edit permissions

### Spotify Developer App (Free)
- Client ID and Client Secret
- Callback URL: `https://your-worker.workers.dev/callback`

## Post-Deployment

Your worker will be available at:
```
https://your-worker-name.your-account-id.workers.dev
```

1. Visit the URL to start setup
2. Enter Spotify credentials via web form
3. Complete OAuth flow
4. Use your API endpoints!

## Endpoints

- `/` - Setup dashboard
- `/now-playing` - Current track
- `/recent` - Recent tracks
- `/health` - Status check

## Need Help?

- Check the main [README](README.md) for troubleshooting
- Verify your Cloudflare credentials have proper permissions
- Ensure your Spotify app callback URL is correct
