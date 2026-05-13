import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getLatestOptimizationRun, insertOptimizationRun } from "@/lib/realityDb";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PYTHON_TIMEOUT_MS = 60_000;
const OPTIMIZER_API_URL = process.env.OPTIMIZER_API_URL?.trim();

interface OptimizerErrorResponse {
  ok: false;
  error: string;
  details?: string[];
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    run: getLatestOptimizationRun()
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return optimizerError("Unauthorized.", 401);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return optimizerError("Invalid JSON payload.", 400);
  }

  try {
    const result = await runOptimizerBridge(payload);
    const failure = getOptimizerFailure(result);

    if (failure) {
      return optimizerError(failure, 500);
    }

    insertOptimizationRun(payload, result);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Optimization bridge failed.";

    return optimizerError(message, 500);
  }
}

function runOptimizerBridge(payload: unknown): Promise<unknown> {
  if (OPTIMIZER_API_URL) {
    return runOptimizerApi(payload);
  }

  const scriptPath = path.join(process.cwd(), "python", "bridge_optimizer.py");

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
      reject(new Error("Optimization timed out."));
    }, PYTHON_TIMEOUT_MS);

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

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      const parsed = parseOptimizerResponse(stdout);

      if (parsed) {
        resolve(parsed);
        return;
      }

      const trimmedStderr = stderr.trim();
      reject(
        new Error(
          trimmedStderr ||
            `Python optimizer exited with code ${code ?? "unknown"} and returned no JSON.`
        )
      );
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function runOptimizerApi(payload: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PYTHON_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPTIMIZER_API_URL}/optimize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payload }),
      cache: "no-store",
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        result?.error ?? `Optimizer API failed with status ${response.status}.`
      );
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Optimization API timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseOptimizerResponse(stdout: string) {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]);
      } catch {
        continue;
      }
    }
  }

  return null;
}

function getOptimizerFailure(result: unknown) {
  if (!result || typeof result !== "object") {
    return "Optimizer returned an invalid response.";
  }

  const payload = result as { ok?: unknown; error?: unknown };

  if (payload.ok === true) {
    return null;
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  return "Optimizer did not complete successfully.";
}

function optimizerError(
  error: string,
  status: number,
  details?: string[]
): NextResponse<OptimizerErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      error,
      details
    },
    { status }
  );
}
