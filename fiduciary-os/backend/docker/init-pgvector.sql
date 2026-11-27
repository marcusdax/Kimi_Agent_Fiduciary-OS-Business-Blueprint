-- Automatic pgvector, uuid-ossp, and pgcrypto initialization for local Docker PostgreSQL
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
