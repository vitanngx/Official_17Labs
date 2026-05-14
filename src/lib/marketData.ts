import { spawn } from "node:child_process";
import path from "node:path";
import { getMarketCache, setMarketCache } from "@/lib/realityDb";

export interface MarketQuote {
  price: number;
  provider: string;
}

export interface MarketHistoryPoint {
  date: string;
  close: number;
}

export interface MarketDataProvider {
  fetchLatestPrice(asset: string): Promise<MarketQuote>;
  fetchPriceHistory(asset: string, range?: string, interval?: string): Promise<MarketHistoryPoint[]>;
}

const QUOTE_TTL_MS = 30 * 60 * 1000;
const FX_TTL_MS = 12 * 60 * 60 * 1000;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const YFINANCE_TIMEOUT_MS = 20_000;
const PYTHON_BIN = process.env.PYTHON_BIN?.trim() || "python3";

class AsyncQueue {
  private concurrency: number;
  private running: number = 0;
  private queue: Array<() => void> = [];

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.next();
        }
      });
      this.next();
    });
  }

  private next() {
    if (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        this.running++;
        task();
      }
    }
  }
}

class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;

  constructor(threshold = 3, resetTimeoutMs = 60000) {
    this.threshold = threshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  isOpen(): boolean {
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        // Half-open state
        this.failures = this.threshold - 1;
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
  }
}

const pythonBridgeQueue = new AsyncQueue(2); // Max 2 concurrent python processes
const yahooCircuitBreaker = new CircuitBreaker(3, 60_000); // 3 failures, wait 60s

class DefaultMarketProvider implements MarketDataProvider {
  async fetchLatestPrice(asset: string): Promise<MarketQuote> {
    if (isCashSymbol(asset)) {
      return { price: 1, provider: "cash" };
    }

    const symbol = normalizeYahooSymbol(asset);
    const cacheKey = `quote:${symbol}`;
    const quote = await withCache<number>(cacheKey, QUOTE_TTL_MS, () => fetchYahooPrice(symbol));

    return { price: quote, provider: "yahoo" };
  }

  async fetchPriceHistory(asset: string, range = "1y", interval = "1d"): Promise<MarketHistoryPoint[]> {
    if (isCashSymbol(asset)) {
      return [];
    }

    const symbol = normalizeYahooSymbol(asset);
    const payload = await withCache<YahooChartResponse>(
      `history:${symbol}:${range}:${interval}`,
      HISTORY_TTL_MS,
      () => fetchMarketChart(symbol, range, interval)
    );
    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];

    return timestamps
      .map((timestamp, index) => {
        const close = closes[index];
        if (typeof close !== "number" || !Number.isFinite(close)) return null;
        return {
          date: new Date(timestamp * 1000).toISOString().slice(0, 10),
          close
        };
      })
      .filter((point): point is MarketHistoryPoint => point !== null);
  }
}

const defaultProvider = new DefaultMarketProvider();

export function fetchLatestPrice(asset: string) {
  return defaultProvider.fetchLatestPrice(asset);
}

export function fetchPriceHistory(asset: string, range?: string, interval?: string) {
  return defaultProvider.fetchPriceHistory(asset, range, interval);
}

export async function fetchFxRate(fromCurrency: string, toCurrency: string) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) return 1;

  const cacheKey = `fx:${from}:${to}`;
  return withCache<number>(cacheKey, FX_TTL_MS, async () => {
    const direct = await fetchYahooPrice(`${from}${to}=X`).catch(() => null);
    if (direct && direct > 0) return direct;

    const inverse = await fetchYahooPrice(`${to}${from}=X`).catch(() => null);
    if (inverse && inverse > 0) return 1 / inverse;

    throw new Error(`Missing FX rate for ${from}/${to}.`);
  });
}

async function withCache<T>(cacheKey: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = getMarketCache<T>(cacheKey);
  if (cached) {
    const age = Date.now() - new Date(cached.updatedAt).getTime();
    if (Number.isFinite(age) && age <= ttlMs) {
      return cached.payload;
    }
  }

  try {
    const fresh = await fetcher();
    setMarketCache(cacheKey, fresh);
    return fresh;
  } catch (error) {
    if (cached) {
      return cached.payload; // Fallback to stale cache if fetch fails
    }
    throw error;
  }
}

function normalizeYahooSymbol(asset: string) {
  const raw = asset.trim().toUpperCase();
  if (raw.includes("-USD") || raw.includes("=X") || raw.startsWith("^")) return raw;
  if (raw.endsWith(".VN") || raw.endsWith(".PA")) return raw;
  return raw;
}

async function fetchYahooPrice(symbol: string) {
  const payload = await fetchMarketChart(symbol, "1d", "1d");
  const result = payload.chart?.result?.[0];
  const metaPrice = result?.meta?.regularMarketPrice;
  if (typeof metaPrice === "number" && Number.isFinite(metaPrice)) return metaPrice;

  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const close = [...closes].reverse().find((value) => typeof value === "number");

  if (typeof close !== "number") throw new Error(`No usable quote for ${symbol}.`);
  return close;
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      meta?: { regularMarketPrice?: number };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

async function fetchYahooChart(symbol: string, range: string, interval: string) {
  if (yahooCircuitBreaker.isOpen()) {
    throw new Error(`Yahoo HTTP API circuit breaker is open. Skipping ${symbol}.`);
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${range}&interval=${interval}`;
  
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" }
    });
  } catch (networkError) {
    yahooCircuitBreaker.recordFailure();
    throw new Error(`Yahoo quote network fetch failed for ${symbol}.`);
  }

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      yahooCircuitBreaker.recordFailure();
    }
    throw new Error(`Yahoo quote failed for ${symbol} with status ${response.status}.`);
  }

  yahooCircuitBreaker.recordSuccess();
  return (await response.json()) as YahooChartResponse;
}

async function fetchMarketChart(symbol: string, range: string, interval: string) {
  const yahoo = await fetchYahooChart(symbol, range, interval).catch(() => null);
  if (yahoo?.chart?.result?.[0]) return yahoo;

  // Fallback to python bridge via queue
  const yfinance = await pythonBridgeQueue.run(() => runYfinanceBridge(symbol, range, interval)).catch(() => null);
  if (yfinance?.ok && yfinance.history.length > 0) {
    return {
      chart: {
        result: [
          {
            timestamp: yfinance.history.map((point) => Math.floor(new Date(`${point.date}T00:00:00Z`).getTime() / 1000)),
            meta: { regularMarketPrice: yfinance.price },
            indicators: { quote: [{ close: yfinance.history.map((point) => point.close) }] }
          }
        ]
      }
    } satisfies YahooChartResponse;
  }

  throw new Error(`No usable market data for ${symbol}.`);
}

interface YfinanceBridgeResponse {
  ok: boolean;
  price?: number;
  history: MarketHistoryPoint[];
}

function runYfinanceBridge(symbol: string, range: string, interval: string): Promise<YfinanceBridgeResponse> {
  const scriptPath = path.join(process.cwd(), "python", "market_quote.py");
  const payload = JSON.stringify({ symbol, range, interval });

  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [scriptPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`yfinance timed out for ${symbol}.`));
    }, YFINANCE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      try {
        const parsed = JSON.parse(stdout.trim()) as YfinanceBridgeResponse;
        resolve(parsed);
      } catch {
        reject(new Error(stderr.trim() || `Unable to parse yfinance response for ${symbol}.`));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

function isCashSymbol(asset: string) {
  return ["USD", "EUR", "VND", "CASH"].includes(asset.trim().toUpperCase());
}
