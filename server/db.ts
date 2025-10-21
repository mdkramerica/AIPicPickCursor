// Reference: blueprint:javascript_database
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure connection pool for optimal performance
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum pool size (adjust based on expected concurrency)
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Timeout if can't connect within 5 seconds
  // Disable SSL verification for local development (Railway proxy SSL mismatch)
  ssl: process.env.NODE_ENV === 'development' ? { rejectUnauthorized: false } : undefined,
});

// Handle unexpected pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });
