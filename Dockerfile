FROM python:3.10-slim

# Install system dependencies needed for Python packages and Git
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory to /app
WORKDIR /app

# Copy requirements from backend directory
COPY backend/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files from repository
COPY . /app

# Set PYTHONPATH to include the backend directory
ENV PYTHONPATH=/app/backend
ENV PYTHONUTF8=1

# Create a storage directory and set write permissions
RUN mkdir -p /app/backend/storage && chmod -R 777 /app/backend/storage

# We run uvicorn from the /app/backend directory
WORKDIR /app/backend

# Expose port 7860 for Hugging Face Spaces
EXPOSE 7860

# Command to run backend. We bind to 0.0.0.0 and port 7860.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
