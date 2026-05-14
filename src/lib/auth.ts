import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export function getApiKey(): string | null {
  return process.env.PORTFOLIO_API_KEY?.trim() || null;
}

export function isAuthenticated(request: NextRequest): boolean {
  const expectedKey = getApiKey();
  
  // If no API key is configured, assume development/open mode unless in production
  if (!expectedKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRITICAL: PORTFOLIO_API_KEY is not configured in production environment!");
      return false; // Fail closed in production
    }
    return true; // Open mode in development
  }

  // 1. Check Authorization header (Bearer token)
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    if (authHeader.substring(7) === expectedKey) return true;
  }

  // 2. Check custom x-api-key header
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader === expectedKey) return true;

  // 3. Check httpOnly cookie
  const cookieStore = cookies();
  const cookieKey = cookieStore.get("official_auth_token")?.value;
  if (cookieKey === expectedKey) return true;

  return false;
}
