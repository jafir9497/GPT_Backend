# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies for native modules and Chromium for PDF generation
RUN apk add --no-cache python3 make g++ git chromium

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
# Skip Puppeteer download for ARM64 compatibility
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies (add curl for health checks and chromium for PDF generation)
RUN apk add --no-cache dumb-init curl chromium

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory
WORKDIR /app

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S goldloan -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies (skip Puppeteer download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Create necessary directories and default assets
RUN mkdir -p assets/logos logs documents/customers documents/employees documents/system/backups documents/system/exports documents/system/logs documents/templates/agreements documents/templates/receipts documents/templates/reports documents/templates/statements uploads && \
    chown -R goldloan:nodejs /app && \
    chmod -R 755 assets documents logs uploads

# Copy Firebase service account file for production
COPY gpt-gold-loan-firebase-adminsdk-fbsvc-cc5648f130.json ./

# Copy assets if they exist (optional)

# Switch to non-root user
USER goldloan

# Expose port
EXPOSE 3000

# Add health check with curl (simpler and more reliable)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]