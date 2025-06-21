# GPT Gold Loan Backend - Coolify Deployment Guide

This guide will help you deploy the GPT Gold Loan Management System backend on Coolify.

## Prerequisites

- Coolify server instance running
- Domain name configured
- Basic understanding of Docker and environment variables

## 🚀 Quick Deployment Steps

### 1. Create New Application in Coolify

1. **Login to Coolify Dashboard**
2. **Click "New Resource" → "Application"**
3. **Select "Public Repository"**
4. **Repository URL**: `https://github.com/jafir9497/GPT_Fullstack_App.git`
5. **Branch**: `main`
6. **Build Pack**: `Docker`
7. **Dockerfile Location**: `backend/Dockerfile`

### 2. Configure Environment Variables

In Coolify's Environment tab, add these variables:

#### Required Variables
```bash
# Database (use Coolify's PostgreSQL service)
DATABASE_URL=postgresql://goldloan_user:YOUR_PASSWORD@postgres:5432/goldloan_db

# JWT Secrets (CHANGE THESE!)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production

# App Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
API_BASE_URL=https://yourdomain.com/api/v1
FRONTEND_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com

# Security
BCRYPT_ROUNDS=12

# Payment Gateway - Razorpay
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret

# Firebase Configuration
FIREBASE_PROJECT_ID=gpt-gold-loan
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@gpt-gold-loan.iam.gserviceaccount.com
```

#### Optional Variables
```bash
# Email Configuration
EMAIL_HOST=smtp.yourdomain.com
EMAIL_PORT=587
EMAIL_SECURE=true
EMAIL_USER=your-email@yourdomain.com
EMAIL_PASS=your-email-password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=GPT Gold Loan

# SMS Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_FROM_NUMBER=+1234567890

# Redis (if using Coolify's Redis service)
REDIS_URL=redis://redis:6379
```

### 3. Add PostgreSQL Database

1. **Create PostgreSQL Service**:
   - Go to "Resources" → "Database" → "PostgreSQL"
   - Name: `goldloan-postgres`
   - Version: `15`
   - Database: `goldloan_db`
   - Username: `goldloan_user`
   - Password: (generate secure password)

2. **Connect to Application**:
   - Link the database to your application
   - Update `DATABASE_URL` environment variable

### 4. Add Redis (Optional)

1. **Create Redis Service**:
   - Go to "Resources" → "Database" → "Redis"
   - Name: `goldloan-redis`
   - Version: `7`

2. **Connect to Application**:
   - Link Redis to your application
   - Update `REDIS_URL` environment variable

### 5. Configure Build Settings

In Coolify's Build tab:

- **Base Directory**: `backend`
- **Build Command**: `npm run build`
- **Install Command**: `npm ci --only=production`
- **Start Command**: `node dist/index.js`

### 6. Configure Health Checks

- **Health Check URL**: `/health`
- **Health Check Interval**: `30s`
- **Health Check Timeout**: `10s`
- **Health Check Retries**: `3`

### 7. Configure Domain & SSL

1. **Add Domain**: your-api-domain.com
2. **Enable SSL**: Coolify will automatically provision SSL certificates
3. **Update CORS settings** in environment variables

## 🔧 Advanced Configuration

### Persistent Storage

Configure persistent volumes in Coolify:

- `/app/uploads` - File uploads
- `/app/documents` - Document storage
- `/app/logs` - Application logs

### Database Migrations

After deployment, run database migrations:

1. **SSH into the container** or use Coolify's terminal
2. **Run Prisma migrations**:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

### Environment-Specific Configuration

Create different environments:
- **Staging**: Use `.env.staging`
- **Production**: Use `.env.production`

### Monitoring & Logging

1. **Application Logs**: Available in Coolify's Logs tab
2. **Health Monitoring**: `/health` endpoint
3. **Metrics**: `/api/metrics` endpoint
4. **API Documentation**: `/api/docs` endpoint

## 🛡️ Security Best Practices

### 1. Environment Variables
- Use strong, unique JWT secrets
- Rotate secrets regularly
- Never commit secrets to Git

### 2. Database Security
- Use strong database passwords
- Enable database backups in Coolify
- Restrict database access to application only

### 3. Application Security
- Keep dependencies updated
- Monitor security alerts
- Use HTTPS only
- Configure proper CORS origins

### 4. Network Security
- Use Coolify's internal networking
- Restrict external database access
- Enable DDoS protection if available

## 📊 Performance Optimization

### 1. Database Performance
```sql
-- Create indexes for frequently queried fields
CREATE INDEX idx_users_phone_number ON users(phone_number);
CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_payments_loan_id ON payments(loan_id);
```

### 2. Redis Caching
Enable Redis for:
- Session storage
- API response caching
- Rate limiting data

### 3. Application Performance
- Enable compression (already configured)
- Use connection pooling
- Monitor memory usage

## 🔍 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check DATABASE_URL format
   postgresql://username:password@host:port/database
   ```

2. **Migration Errors**
   ```bash
   # Reset and rerun migrations
   npx prisma migrate reset --force
   npx prisma migrate deploy
   ```

3. **Firebase Authentication Issues**
   - Verify Firebase service account key
   - Check FIREBASE_PROJECT_ID
   - Ensure proper key formatting

4. **Build Failures**
   - Check Node.js version compatibility
   - Verify all dependencies are listed
   - Review build logs in Coolify

### Debugging Commands

```bash
# Check application health
curl https://yourdomain.com/health

# View application logs
docker logs container_name

# Check database connection
psql $DATABASE_URL -c "SELECT version();"

# Test Redis connection
redis-cli -u $REDIS_URL ping
```

## 🔄 Deployment Workflow

### Automatic Deployment
Coolify can automatically deploy when you push to the main branch:

1. **Enable Auto Deploy** in Coolify
2. **Configure Webhook** (optional)
3. **Set Deploy Branch** to `main`

### Manual Deployment
1. Go to Coolify Dashboard
2. Select your application
3. Click "Deploy" button
4. Monitor deployment logs

### Rollback Strategy
1. Keep previous deployment images
2. Use Coolify's rollback feature
3. Database backup before major changes

## 📈 Monitoring & Maintenance

### Health Monitoring
- Monitor `/health` endpoint
- Set up alerts in Coolify
- Track application metrics

### Database Maintenance
- Regular backups (automated in Coolify)
- Monitor database size
- Optimize queries periodically

### Updates & Patches
- Keep dependencies updated
- Monitor security advisories
- Test updates in staging first

## 🔗 Useful URLs

After successful deployment:
- **API Base**: `https://yourdomain.com/api/v1`
- **Health Check**: `https://yourdomain.com/health`
- **API Documentation**: `https://yourdomain.com/api/docs`
- **Metrics**: `https://yourdomain.com/api/metrics`

## 📞 Support

For deployment issues:
1. Check Coolify logs
2. Review environment variables
3. Verify database connectivity
4. Check application health endpoint

---

**Note**: Replace `yourdomain.com` with your actual domain and update all placeholder values with your actual configuration.