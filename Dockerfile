FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set up user with UID 1000 (Hugging Face Spaces requirement)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH

# Set working directory inside home
WORKDIR $HOME/app

# Copy requirements and install dependencies
COPY --chown=user backend/requirements.txt $HOME/app/requirements.txt
RUN pip install --no-cache-dir --user -r $HOME/app/requirements.txt

# Copy all files and set ownership to user
COPY --chown=user . $HOME/app

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
