import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const expectedKey = getApiKey();

    if (!expectedKey) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ ok: false, error: "Authentication configuration missing on server." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, message: "No auth configured in development mode." });
    }

    if (password !== expectedKey) {
      return NextResponse.json({ ok: false, error: "Invalid password." }, { status: 401 });
    }

    const cookieStore = cookies();
    cookieStore.set({
      name: "official_auth_token",
      value: expectedKey,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
}
