import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema.ts';

// Local development secrets live in .env.local; deployment-provided values
// remain authoritative because dotenv does not override existing variables.
dotenv.config({ path: '.env.local' });
dotenv.config();

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const poolOptions = {
      max: 10,
      connectionTimeoutMillis: 15000,
    };
    global._postgresPool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL, ...poolOptions })
      : new Pool({
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          ...poolOptions,
        });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
