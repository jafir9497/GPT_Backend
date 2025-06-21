# Use Node.js 18 alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

# Create necessary directories
RUN mkdir -p logs documents/customers documents/employees documents/system/backups documents/system/exports documents/system/logs documents/templates/agreements documents/templates/receipts documents/templates/reports documents/templates/statements uploads

# Set proper permissions
RUN chmod -R 755 documents logs uploads

# Build TypeScript
RUN npm run build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S goldloan -u 1001

# Change ownership of app directory
RUN chown -R goldloan:nodejs /app

# Switch to non-root user
USER goldloan

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { \
    process.exit(res.statusCode === 200 ? 0 : 1); \
  }).on('error', () => process.exit(1));"

# Start the application
CMD ["npm", "start"]