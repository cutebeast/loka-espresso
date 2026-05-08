-- FNB Enterprise v3 — Database Extensions
-- Run as superuser or database owner

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Trigram similarity for fuzzy search
CREATE EXTENSION IF NOT EXISTS "cube";          -- For advanced geospatial
CREATE EXTENSION IF NOT EXISTS "earthdistance"; -- Earth distance calculations
