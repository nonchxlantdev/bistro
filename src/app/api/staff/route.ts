import { NextResponse, type NextRequest } from "next/server";
import { loadDemoConfig } from "@/lib/auth/demo-access";
import { STAFF_COOKIE, STAFF_SESSION_SECONDS, issueStaffSession, verifyStaffSession } from "@/lib/auth/staff-session";
import { AppError } from "@/lib/errors";
import { listStaff, verifyStaffPin } from "@/lib/services/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const cookie = (request: NextRequest, value: string, maxAge: number) => ({ name: STAFF_COOKIE, value, httpOnly: true, sameSite: "strict" as const, secure: request.nextUrl.protocol === "https:", path: "/", maxAge });

/** Names for the sign-in screen, plus who is signed in now. */
export async function GET(request: NextRequest) {
  try {
    const config = await loadDemoConfig();
    return NextResponse.json({ staff: await listStaff(), current: verifyStaffSession(request.cookies.get(STAFF_COOKIE)?.value, config) }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof AppError ? error.message : "Could not load staff." }, { status: error instanceof AppError ? error.status : 500, headers }); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Open the app directly to continue." }, { status: 403, headers });
  let input: { action?: string; staffId?: unknown; pin?: unknown };
  try { input = await request.json(); } catch { return NextResponse.json({ error: "The request is invalid." }, { status: 400, headers }); }
  if (input.action === "logout") {
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(cookie(request, "", 0));
    return response;
  }
  if (input.action !== "login") return NextResponse.json({ error: "Unknown action." }, { status: 400, headers });
  try {
    const staff = await verifyStaffPin(input.staffId, input.pin);
    const response = NextResponse.json({ staff }, { headers });
    response.cookies.set(cookie(request, issueStaffSession(staff, await loadDemoConfig()), STAFF_SESSION_SECONDS));
    return response;
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    console.error(error);
    return NextResponse.json({ error: "Could not sign in. Try again." }, { status: 500, headers });
  }
}
