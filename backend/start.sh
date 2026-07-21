#!/bin/bash

# Print status information
echo "=== OmniVoice Gateway Startup Script ==="

# Check if Cloudflare Tunnel Token is provided
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
    echo "[Cloudflare Tunnel] Token found. Starting cloudflared tunnel..."
    # Run cloudflared in the background. --no-autoupdate avoids updates that might fail in container.
    cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
    echo "[Cloudflare Tunnel] cloudflared launched in background."
else
    echo "[Cloudflare Tunnel] CLOUDFLARE_TUNNEL_TOKEN is not set. Skipping tunnel."
fi

# Run the FastAPI application using uvicorn
echo "[App] Starting FastAPI application on port 7860..."
exec uvicorn app.main:app --host 0.0.0.0 --port 7860
