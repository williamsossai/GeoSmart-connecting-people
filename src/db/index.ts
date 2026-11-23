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

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL || process.env.SQL_HOST);

function createMockDb() {
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };

  const makeChain = (): any =>
    new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            return (resolve: (value: any[]) => void) => resolve([]);
          }
          return () => makeChain();
        },
      }
    );

  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'query') {
          return new Proxy({}, { get: () => noOp });
        }
        if (prop === 'transaction') {
          return async (fn: (tx: any) => Promise<any>) => fn(createMockDb());
        }
        if (prop === 'execute') {
          return async () => ({ rows: [] });
        }
        return () => makeChain();
      },
    }
  ) as ReturnType<typeof drizzle<typeof schema>>;
}

export const createPool = () => {
  if (!isDatabaseConfigured) {
    return undefined;
  }
  if (!global._postgresPool) {
    const poolOptions = {
      max: 10,
      connectionTimeoutMillis: 3000,
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

let db: ReturnType<typeof drizzle<typeof schema>>;
let databaseConnected = false;
let dbProbePromise: Promise<void> = Promise.resolve();

if (isDatabaseConfigured) {
  try {
    const pool = createPool();
    if (!pool) {
      throw new Error('PostgreSQL pool could not be initialized.');
    }
    db = drizzle(pool, { schema });
    dbProbePromise = Promise.race([
      pool.query('SELECT 1').then(() => {
        databaseConnected = true;
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Database probe timed out')), 2500)
      ),
    ]).catch((err) => {
      databaseConnected = false;
      console.warn('[AI Studio] PostgreSQL unreachable — using in-memory mock:', err?.message || err);
    });
  } catch (error) {
    console.warn('[AI Studio] Database not connected — using mock:', error);
    db = createMockDb();
  }
} else {
  console.warn('[AI Studio] Database not configured — using in-memory mock.');
  db = createMockDb();
}

export async function shouldUseMockDatabase(): Promise<boolean> {
  if (!isDatabaseConfigured) return true;
  await dbProbePromise;
  return !databaseConnected;
}

export { db };
