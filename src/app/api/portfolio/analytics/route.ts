import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { PortfolioTransaction } from "@/types/reality";
import { listTransactions, getMarketCache, setMarketCache } from "@/lib/realityDb";
import { createHash } from "node:crypto";

const PYTHON_BIN = process.env.PYTHON_BIN?.trim() || "python3";
const ANALYTICS_CACHE_VERSION = "v5";
const ANALYTICS_TIMEOUT_MS = 45_000;

export interface AnalyticsResponse {
  ok: boolean;
  dates?: string[];
  portfolio?: number[];
  benchmark?: number[];
  benchmark_ok?: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { benchmark, baseCurrency = "USD", dateRange = "ALL", mode = "ACTUAL" } = await request.json();

    // Fetch transactions
    const transactions = listTransactions();

    if (transactions.length === 0) {
      return NextResponse.json({ ok: false, error: "No transactions found." });
    }
    
    // Check cache
    const txHashInput = JSON.stringify(transactions);
    const txHash = createHash("md5").update(txHashInput).digest("hex");
    const cacheKey = `analytics_${ANALYTICS_CACHE_VERSION}_${txHash}_${baseCurrency}_${benchmark}_${dateRange}_${mode}`;
    
    const cached = getMarketCache<AnalyticsResponse>(cacheKey);
    if (cached) {
      // Return cached if less than 6 hours old
      const cacheAgeMs = Date.now() - new Date(cached.updatedAt).getTime();
      if (cacheAgeMs < 6 * 60 * 60 * 1000) {
        return NextResponse.json(cached.payload);
      }
    }

    // Call Python bridge
    const pythonScript = path.join(process.cwd(), "python", "bridge_analytics.py");
    const payload = JSON.stringify({ transactions, baseCurrency, benchmark, dateRange, mode });

    return new Promise<NextResponse>((resolve) => {
      const py = spawn(PYTHON_BIN, [pythonScript]);
      let settled = false;

      let outputData = "";
      let errorData = "";
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        py.kill();
        resolve(
          NextResponse.json(
            { ok: false, error: "Analytics computation timed out." },
            { status: 504 }
          )
        );
      }, ANALYTICS_TIMEOUT_MS);

      py.stdout.on("data", (data) => {
        outputData += data.toString();
      });

      py.stderr.on("data", (data) => {
        errorData += data.toString();
      });

      py.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        if (code !== 0) {
          console.error("Python bridge_analytics exited with code", code);
          console.error("stderr:", errorData);
          resolve(NextResponse.json({ ok: false, error: "Analytics computation failed." }, { status: 500 }));
          return;
        }

        try {
          const result = JSON.parse(outputData) as AnalyticsResponse;
          if (result.ok && result.benchmark_ok !== false) {
             setMarketCache(cacheKey, result);
          }
          resolve(NextResponse.json(result));
        } catch (e) {
          console.error("Failed to parse Python analytics output:", outputData);
          resolve(NextResponse.json({ ok: false, error: "Invalid response from analytics engine." }, { status: 500 }));
        }
      });

      py.stdin.write(payload);
      py.stdin.end();
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to compute analytics.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
