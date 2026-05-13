import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { OptimizationRun, PortfolioTransaction, TransactionInput } from "@/types/reality";

const configuredDataDirectory =
  process.env.PORTFOLIO_DATA_DIR?.trim() || path.join(process.cwd(), "data");
const databasePath =
  process.env.PORTFOLIO_DB_PATH?.trim() || path.join(configuredDataDirectory, "official.db");
const dataDirectory = path.dirname(databasePath);

function ensureDataDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __realityDb: DatabaseSync | undefined;
}

let dbInstance: DatabaseSync | undefined;

function getDatabase(): DatabaseSync {
  if (process.env.NODE_ENV !== "production") {
    if (globalThis.__realityDb) {
      return globalThis.__realityDb;
    }
  } else {
    if (dbInstance) {
      return dbInstance;
    }
  }

  ensureDataDirectory();
  const db = new DatabaseSync(databasePath);

  // Enable Write-Ahead Logging for better concurrent read/write performance
  db.exec("PRAGMA journal_mode = WAL;");

  migrate(db);

  if (process.env.NODE_ENV !== "production") {
    globalThis.__realityDb = db;
  } else {
    dbInstance = db;
  }

  return db;
}

function withDatabase<T>(run: (database: DatabaseSync) => T): T {
  const db = getDatabase();
  // Do NOT close the database here, it is a singleton connection.
  return run(db);
}

function migrate(database: DatabaseSync) {
  const existingTransactionTable = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'`)
    .get() as { sql?: string } | undefined;

  if (
    existingTransactionTable?.sql &&
    !existingTransactionTable.sql.includes("'CASH_IN'")
  ) {
    database.exec(`
      ALTER TABLE transactions RENAME TO transactions_legacy;
    `);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL', 'TRANSFER', 'CASH_IN', 'CASH_OUT', 'DIVIDEND')),
      date TEXT NOT NULL,
      asset TEXT NOT NULL,
      amount REAL NOT NULL,
      price REAL NOT NULL,
      fees REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS optimization_runs (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date
    ON transactions(date, created_at);
  `);

  const legacyExists = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions_legacy'`)
    .get();

  if (legacyExists) {
    database.exec(`
      INSERT INTO transactions (id, type, date, asset, amount, price, fees, currency, note, created_at, updated_at)
      SELECT id, type, date, asset, amount, price, 0, currency, NULL, created_at, created_at
      FROM transactions_legacy;

      DROP TABLE transactions_legacy;
    `);
  }
}

export function listTransactions(): PortfolioTransaction[] {
  return withDatabase((database) => {
    const rows = database
      .prepare(
        `SELECT id, type, date, asset, amount, price, fees, currency, note, created_at, updated_at
         FROM transactions
         ORDER BY date ASC, created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(mapRowToTransaction);
  });
}

export function insertTransaction(input: TransactionInput): PortfolioTransaction {
  return withDatabase((database) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const normalized = normalizeTransactionInput(input);

    database
      .prepare(
        `INSERT INTO transactions (id, type, date, asset, amount, price, fees, currency, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        normalized.type,
        normalized.date,
        normalized.asset,
        normalized.amount,
        normalized.price,
        normalized.fees,
        normalized.currency,
        normalized.note ?? null,
        now,
        now
      );

    return {
      id,
      ...normalized,
      createdAt: now
    };
  });
}

export function updateTransaction(id: string, input: TransactionInput): PortfolioTransaction {
  return withDatabase((database) => {
    const normalized = normalizeTransactionInput(input);
    const now = new Date().toISOString();

    database
      .prepare(
        `UPDATE transactions
         SET type = ?, date = ?, asset = ?, amount = ?, price = ?, fees = ?, currency = ?, note = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        normalized.type,
        normalized.date,
        normalized.asset,
        normalized.amount,
        normalized.price,
        normalized.fees,
        normalized.currency,
        normalized.note ?? null,
        now,
        id
      );

    const row = database
      .prepare(
        `SELECT id, type, date, asset, amount, price, fees, currency, note, created_at, updated_at
         FROM transactions
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error("Transaction not found.");
    }

    return mapRowToTransaction(row);
  });
}

export function deleteTransaction(id: string) {
  return withDatabase((database) => {
    database.prepare(`DELETE FROM transactions WHERE id = ?`).run(id);
  });
}

export function getMarketCache<T>(cacheKey: string) {
  return withDatabase((database) => {
    const row = database
      .prepare(`SELECT payload, updated_at FROM market_cache WHERE cache_key = ?`)
      .get(cacheKey) as { payload?: string; updated_at?: string } | undefined;

    if (!row?.payload || !row.updated_at) {
      return null;
    }

    return {
      payload: JSON.parse(row.payload) as T,
      updatedAt: row.updated_at
    };
  });
}

export function setMarketCache(cacheKey: string, payload: unknown) {
  return withDatabase((database) => {
    database
      .prepare(
        `INSERT INTO market_cache (cache_key, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`
      )
      .run(cacheKey, JSON.stringify(payload), new Date().toISOString());
  });
}

export function insertOptimizationRun(config: unknown, result: unknown): OptimizationRun {
  return withDatabase((database) => {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    database
      .prepare(
        `INSERT INTO optimization_runs (id, config, result, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, JSON.stringify(config), JSON.stringify(result), createdAt);

    return {
      id,
      createdAt,
      config,
      result
    };
  });
}

export function getLatestOptimizationRun(): OptimizationRun | null {
  return withDatabase((database) => {
    const row = database
      .prepare(
        `SELECT id, config, result, created_at
         FROM optimization_runs
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as
      | {
          id: string;
          config: string;
          result: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      config: JSON.parse(row.config),
      result: JSON.parse(row.result)
    };
  });
}

const VALID_TRANSACTION_TYPES = ["BUY", "SELL", "TRANSFER", "CASH_IN", "CASH_OUT", "DIVIDEND"] as const;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STRING_LENGTH = 100;

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required and must not be empty.`);
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_STRING_LENGTH) {
    throw new Error(`${fieldName} must be ${MAX_STRING_LENGTH} characters or fewer.`);
  }

  return trimmed;
}

function normalizeTransactionInput(input: TransactionInput): TransactionInput {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid transaction input.");
  }

  if (!VALID_TRANSACTION_TYPES.includes(input.type as typeof VALID_TRANSACTION_TYPES[number])) {
    throw new Error(`Invalid transaction type: ${String(input.type).slice(0, 50)}. Must be one of: ${VALID_TRANSACTION_TYPES.join(", ")}.`);
  }

  if (typeof input.date !== "string" || !isValidDate(input.date)) {
    throw new Error("date must be a valid calendar date in YYYY-MM-DD format.");
  }

  const asset = requireNonEmptyString(input.asset, "asset");
  const currency = requireNonEmptyString(input.currency, "currency");

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("amount must be greater than zero.");
  }

  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new Error("price must be zero or greater.");
  }

  if (!Number.isFinite(input.fees) || input.fees < 0) {
    throw new Error("fees must be zero or greater.");
  }

  const note = typeof input.note === "string" ? input.note.trim() : null;

  return {
    type: input.type,
    date: input.date,
    asset: asset.toUpperCase(),
    amount: input.amount,
    price: input.price,
    fees: input.fees,
    currency: currency.toUpperCase(),
    note: note && note.length > 0 ? note.slice(0, 500) : null
  };
}

function mapRowToTransaction(row: Record<string, unknown>): PortfolioTransaction {
  return {
    id: String(row.id),
    type: row.type as PortfolioTransaction["type"],
    date: String(row.date),
    asset: String(row.asset),
    amount: Number(row.amount),
    price: Number(row.price),
    fees: Number(row.fees ?? 0),
    currency: String(row.currency),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at)
  };
}
