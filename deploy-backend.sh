#!/bin/bash

# Script to create a backend-only repository for Coolify deployment
# Run this script from the project root directory

echo "🚀 Creating backend-only repository for Coolify deployment..."

# Create a temporary directory
TEMP_DIR="gpt-backend-deploy"
rm -rf $TEMP_DIR
mkdir $TEMP_DIR

# Copy backend files
echo "📁 Copying backend files..."
cp -r backend/* $TEMP_DIR/
cp backend/.dockerignore $TEMP_DIR/ 2>/dev/null || true
cp backend/.env.production $TEMP_DIR/ 2>/dev/null || true

# Initialize git repository
cd $TEMP_DIR
git init
git add .
git commit -m "Initial backend deployment setup

Backend optimized for Coolify deployment with:
- Multi-stage Docker build
- Production environment configuration
- Health checks and monitoring
- PostgreSQL and Redis integration
- Nginx reverse proxy setup

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo "✅ Backend repository created in: $TEMP_DIR"
echo ""
echo "📋 Next steps:"
echo "1. Create a new GitHub repository for backend"
echo "2. Add remote: git remote add origin <your-backend-repo-url>"
echo "3. Push: git push -u origin main"
echo "4. Use the new repository URL in Coolify"
echo ""
echo "🔗 Repository structure:"
ls -la

cd ..
echo "📂 Backend deployment repository ready in: $(pwd)/$TEMP_DIR"