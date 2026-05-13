import { spawn } from "node:child_process";
import path from "node:path";
import { getMarketCache, setMarketCache } from "@/lib/realityDb";

interface MarketQuote {
  price: number;
  provider: string;
}

export interface MarketHistoryPoint {
  date: string;
  close: number;
}

const QUOTE_TTL_MS = 30 * 60 * 1000;
const FX_TTL_MS = 12 * 60 * 60 * 1000;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const YFINANCE_TIMEOUT_MS = 20_000;

export async function fetchLatestPrice(asset: string): Promise<MarketQuote> {
  if (isCashSymbol(asset)) {
    return {
      price: 1,
      provider: "cash"
    };
  }

  const symbol = normalizeYahooSymbol(asset);
  const cacheKey = `quote:${symbol}`;
  const quote = await withCache<number>(
    cacheKey,
    QUOTE_TTL_MS,
    () => fetchYahooPrice(symbol)
  );

  return {
    price: quote,
    provider: "yahoo"
  };
}

export async function fetchFxRate(fromCurrency: string, toCurrency: string) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return 1;
  }

  const cacheKey = `fx:${from}:${to}`;
  return withCache<number>(cacheKey, FX_TTL_MS, async () => {
    const direct = await fetchYahooPrice(`${from}${to}=X`).catch(() => null);
    if (direct && direct > 0) {
      return direct;
    }

    const inverse = await fetchYahooPrice(`${to}${from}=X`).catch(() => null);
    if (inverse && inverse > 0) {
      return 1 / inverse;
    }

    throw new Error(`Missing FX rate for ${from}/${to}.`);
  });
}

export async function fetchPriceHistory(
  asset: string,
  range = "1y",
  interval = "1d"
): Promise<MarketHistoryPoint[]> {
  if (isCashSymbol(asset)) {
    return [];
  }

  const symbol = normalizeYahooSymbol(asset);
  const payload = await withCache<YahooChartResponse>(
    `history:${symbol}:${range}:${interval}`,
    HISTORY_TTL_MS,
    () => fetchYahooChart(symbol, range, interval)
  );
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((timestamp, index) => {
      const close = closes[index];
      if (typeof close !== "number" || !Number.isFinite(close)) {
        return null;
      }

      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close
      };
    })
    .filter((point): point is MarketHistoryPoint => point !== null);
}

async function withCache<T>(
  cacheKey: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
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
      return cached.payload;
    }

    throw error;
  }
}

function normalizeYahooSymbol(asset: string) {
  const raw = asset.trim().toUpperCase();

  if (raw.includes("-USD") || raw.includes("=X") || raw.startsWith("^")) {
    return raw;
  }

  if (raw.endsWith(".VN") || raw.endsWith(".PA")) {
    return raw;
  }

  return raw;
}

async function fetchYahooPrice(symbol: string) {
  const payload = await fetchMarketChart(symbol, "1d", "1d");
  const result = payload.chart?.result?.[0];
  const metaPrice = result?.meta?.regularMarketPrice;
  if (typeof metaPrice === "number" && Number.isFinite(metaPrice)) {
    return metaPrice;
  }

  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const close = [...closes].reverse().find((value) => typeof value === "number");

  if (typeof close !== "number") {
    throw new Error(`No usable quote for ${symbol}.`);
  }

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
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${range}&interval=${interval}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo quote failed for ${symbol}.`);
  }

  return (await response.json()) as YahooChartResponse;
}

async function fetchMarketChart(symbol: string, range: string, interval: string) {
  const yahoo = await fetchYahooChart(symbol, range, interval).catch(() => null);
  if (yahoo?.chart?.result?.[0]) {
    return yahoo;
  }

  const yfinance = await runYfinanceBridge(symbol, range, interval).catch(() => null);
  if (yfinance?.ok && yfinance.history.length > 0) {
    return {
      chart: {
        result: [
          {
            timestamp: yfinance.history.map((point) =>
              Math.floor(new Date(`${point.date}T00:00:00Z`).getTime() / 1000)
            ),
            meta: {
              regularMarketPrice: yfinance.price
            },
            indicators: {
              quote: [
                {
                  close: yfinance.history.map((point) => point.close)
                }
              ]
            }
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

function runYfinanceBridge(
  symbol: string,
  range: string,
  interval: string
): Promise<YfinanceBridgeResponse> {
  const scriptPath = path.join(process.cwd(), "python", "market_quote.py");
  const payload = JSON.stringify({ symbol, range, interval });

  return new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`yfinance timed out for ${symbol}.`));
    }, YFINANCE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", () => {
      if (settled) {
        return;
      }

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
