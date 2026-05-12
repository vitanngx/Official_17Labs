import { NextRequest, NextResponse } from "next/server";
import { buildPortfolioReality } from "@/lib/portfolioReality";
import { listTransactions } from "@/lib/realityDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const baseCurrency =
    request.nextUrl.searchParams.get("baseCurrency")?.trim().toUpperCase() || "USD";

  try {
    const payload = await buildPortfolioReality(listTransactions(), baseCurrency);
    console.info(
      `[portfolio/reality] base=${baseCurrency} holdings=${payload.holdings.length} totalMs=${
        Date.now() - startedAt
      } warnings=${payload.warnings.length}`
    );
    return NextResponse.json(payload);
  } catch (error) {
    console.error(`[portfolio/reality] failed totalMs=${Date.now() - startedAt}`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to build portfolio reality."
      },
      { status: 500 }
    );
  }
}
