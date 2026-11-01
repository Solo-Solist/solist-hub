# =============================================================================
# PDFCraft Production Dockerfile
# Multi-stage build for optimized image size
# Optimized with BuildKit cache mounts for faster builds
# =============================================================================

# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1: Build the Next.js static export
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
# Use BuildKit cache mount to persist npm cache across builds
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# Copy source code
COPY . .

# Build the static export
# Use BuildKit cache mount for Next.js cache to speed up rebuilds
ARG BASE_PATH=""
ARG APP_VERSION=""
ARG DISABLE_UPDATE_CHECK=""
ENV BASE_PATH=$BASE_PATH
ENV APP_VERSION=$APP_VERSION
ENV DISABLE_UPDATE_CHECK=$DISABLE_UPDATE_CHECK
ENV DOCKER_BUILD=true
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/app/.next/cache \
    npm run build

# -----------------------------------------------------------------------------
# Stage 2: Serve with Nginx
# -----------------------------------------------------------------------------
FROM nginx:1.25-alpine AS production

# Add labels for GitHub Container Registry
LABEL org.opencontainers.image.source="https://github.com/PDFCraftTool/pdfcraft"
LABEL org.opencontainers.image.description="PDFCraft - Professional PDF Tools, Free, Private & Browser-Based"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.title="PDFCraft"
LABEL org.opencontainers.image.vendor="PDFCraftTool"

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

# Copy the static export from builder stage
COPY --from=builder /app/out /website/pdfcraft

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
