# Use Node.js 22 to satisfy firecrawl-js requirements
# SECURITY FIX: Pin image with hash for reproducible builds
FROM node:22-alpine@sha256:6e80991f69cc7722c561e5d14d5e72ab47c0d6b6cfb3ae50fb9cf9a7b30fdf97

# SECURITY FIX: Use shell with pipefail
SHELL ["/bin/ash", "-o", "pipefail", "-c"]

# Install system dependencies including Chromium for Puppeteer
RUN apk add --no-cache \
    curl \
    bash \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Tell Puppeteer to skip installing Chromium. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files from backend directory (building from project root)
COPY backend/package*.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy source code from backend directory
COPY backend/src ./src

# Copy data directories from project root
COPY ../data ./data
COPY ../trusteddata ./trusteddata

# Create necessary directories with proper structure
RUN mkdir -p /app/storage/generated \
    && mkdir -p /app/storage/jobs \
    && mkdir -p /app/logs/application \
    && mkdir -p /app/logs/debug \
    && mkdir -p /app/logs \
    && touch /app/logs/app.log \
    && touch /app/logs/error.log

# Set proper permissions for all directories and files
RUN chown -R node:node /app \
    && chmod -R 755 /app/logs \
    && chmod -R 755 /app/storage

# Switch to non-root user
USER node

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Environment variables with defaults
ENV NODE_ENV=production \
    PORT=3001 \
    LOG_LEVEL=info

# SECURITY FIX: Use JSON notation for CMD (already correct, but adding comment)
CMD ["node", "src/app.js"]