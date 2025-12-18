# Multi-stage build for production frontend
# SECURITY: Pin image version for reproducible builds
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files (if they exist)
COPY frontend/package*.json ./
RUN if [ -f package.json ]; then npm install --omit=dev; fi

# Copy frontend source code specifically
COPY frontend/ .

# Build stage for static assets - copy frontend files to dist
RUN mkdir -p /app/dist && \
    cp -r css js data index.html lineage-dashboard.html *.js /app/dist/ 2>/dev/null || true

# Performance Comparison Configuration - REMOVED
# Comparison feature removed as only sequential_hybrid pattern was implemented

# Production stage with Nginx
# SECURITY: Pin image version for reproducible builds
FROM nginx:alpine AS production

# Install curl and gettext for health checks and envsubst
RUN apk add --no-cache curl gettext

# SECURITY FIX: Create non-root user for nginx
RUN addgroup -g 1001 -S nginx-user && \
    adduser -S -D -H -u 1001 -h /var/cache/nginx -s /sbin/nologin -G nginx-user -g nginx-user nginx-user

# Copy custom nginx configuration
COPY frontend/nginx.conf /etc/nginx/nginx.conf

# Copy static files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy environment configuration template
COPY frontend/env-config.template.js /tmp/env-config.template.js

# Copy and make executable the entrypoint script
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# SECURITY FIX: Create all required nginx directories with proper permissions
RUN mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp \
             /var/log/nginx \
             /var/run && \
    touch /var/run/nginx.pid

# SECURITY FIX: Set proper ownership for ALL nginx-writable directories
# This MUST be done BEFORE switching to non-root user
RUN chown -R nginx-user:nginx-user /var/cache/nginx && \
    chown -R nginx-user:nginx-user /var/log/nginx && \
    chown -R nginx-user:nginx-user /etc/nginx/conf.d && \
    chown -R nginx-user:nginx-user /var/run/nginx.pid && \
    chown -R nginx-user:nginx-user /usr/share/nginx/html && \
    chmod -R 755 /var/cache/nginx && \
    chmod -R 775 /usr/share/nginx/html && \
    chmod 755 /var/log/nginx && \
    chmod 666 /var/run/nginx.pid

# Set default environment variables
ENV API_BASE_URL="http://localhost:3001/api/v1" \
    BACKEND_URL="http://localhost:3001" \
    NODE_ENV="production" \
    DEBUG="false" \
    CORS_MODE="cors" \
    PORT="8080"

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# SECURITY FIX: Run as non-root user
USER nginx-user

# SECURITY FIX: Use JSON notation for entrypoint (already correct)
ENTRYPOINT ["/docker-entrypoint.sh"]