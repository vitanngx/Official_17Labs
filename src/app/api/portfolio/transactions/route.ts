import { NextRequest, NextResponse } from "next/server";
import {
  deleteTransaction,
  insertTransaction,
  listTransactions,
  updateTransaction
} from "@/lib/realityDb";
import { TransactionInput } from "@/types/reality";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    transactions: listTransactions()
  });
}

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as TransactionInput;
    const transaction = insertTransaction(input);

    return NextResponse.json({
      ok: true,
      transaction
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to save transaction."
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing transaction id." }, { status: 400 });
  }

  try {
    const input = (await request.json()) as TransactionInput;
    const transaction = updateTransaction(id, input);

    return NextResponse.json({
      ok: true,
      transaction
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update transaction."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing transaction id." }, { status: 400 });
  }

  deleteTransaction(id);
  return NextResponse.json({ ok: true });
}
