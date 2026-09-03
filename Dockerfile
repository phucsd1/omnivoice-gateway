FROM python:3.11-slim


# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    ffmpeg \
    nodejs \
    npm \
    sqlite3 \
    unzip \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Tailscale static binaries (supports userspace networking)
RUN curl -fsSL https://pkgs.tailscale.com/stable/tailscale_1.80.3_amd64.tgz -o /tmp/tailscale.tgz \
    && tar -C /tmp -xzf /tmp/tailscale.tgz \
    && mv /tmp/tailscale_1.80.3_amd64/tailscale /usr/local/bin/tailscale \
    && mv /tmp/tailscale_1.80.3_amd64/tailscaled /usr/local/bin/tailscaled \
    && chmod +x /usr/local/bin/tailscale /usr/local/bin/tailscaled \
    && rm -rf /tmp/tailscale*

# Set up user with UID 1000 (Hugging Face Spaces requirement)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
ENV DENO_INSTALL=$HOME/.deno
ENV PATH=$HOME/.deno/bin:$HOME/.local/bin:$PATH

# Install Deno for yt-dlp native JavaScript challenge solver
RUN curl -fsSL https://deno.land/install.sh | sh

# Set working directory inside home
WORKDIR $HOME/app

# Copy requirements and install dependencies
COPY --chown=user backend/requirements.txt $HOME/app/requirements.txt
RUN pip install --no-cache-dir --user -r $HOME/app/requirements.txt && pip install --no-cache-dir --user curl_cffi "yt-dlp[default,curl-cffi]" bgutil-ytdlp-pot-provider && python3 -m yt_dlp --remote-components ejs:github --version || true

# Copy all files and set ownership to user
COPY --chown=user . $HOME/app

# Build frontend static bundle
WORKDIR $HOME/app/frontend
RUN npm install && npm run build

# Set PYTHONPATH and Python UTF8 environment variables
ENV PYTHONPATH=$HOME/app/backend
ENV PYTHONUTF8=1

# Create storage directory inside app
RUN mkdir -p $HOME/app/backend/storage

# Set working directory to backend folder
WORKDIR $HOME/app/backend

# Expose port 7860
EXPOSE 7860

# Run uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
