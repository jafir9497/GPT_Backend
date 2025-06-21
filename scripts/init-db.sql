-- Database initialization script for PostgreSQL
-- This script runs when the database container starts for the first time

-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set timezone
SET timezone = 'UTC';

-- Create indexes for performance (will be created by Prisma migrations)
-- These are just placeholders for manual optimization if needed

-- Log database initialization
DO $$
BEGIN
    RAISE NOTICE 'Database initialized successfully for GPT Gold Loan Management System';
    RAISE NOTICE 'UUID extension: %', (SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'));
    RAISE NOTICE 'PGCrypto extension: %', (SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'));
    RAISE NOTICE 'Timezone: %', current_setting('timezone');
END $$;