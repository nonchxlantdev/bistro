import { NextResponse, type NextRequest } from "next/server";
import { issueDemoSession, loadDemoConfig, SESSION_SECONDS, verifyDemoPassword, verifyDemoSession, type DemoStage } from "@/lib/auth/demo-access";
import { DEMO_COOKIE } from "@/lib/demo-policy";
import { STAFF_COOKIE } from "@/lib/auth/staff-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A shared local-demo throttle, deliberately independent of spoofable IP headers.
let attempts = 0;
let windowStart = 0;
const headers = { "Cache-Control": "no-store" };

function sessionResponse(request: NextRequest, stage: DemoStage, token: string) {
  const response = NextResponse.json({ stage }, { headers });
  response.cookies.set(DEMO_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: SESSION_SECONDS });
  return response;
}

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ stage: verifyDemoSession(request.cookies.get(DEMO_COOKIE)?.value, await loadDemoConfig())?.stage ?? "login" }, { headers }); }
  catch { return NextResponse.json({ error: "Demo access is not configured. Ask the demo host to run the access setup.", code: "DEMO_NOT_CONFIGURED" }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Open the demo directly to continue." }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Use a JSON request." }, { status: 415, headers });
  let input: { action?: string; password?: unknown; accepted?: boolean };
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new Error();
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
  } catch { return NextResponse.json({ error: "The access request is invalid." }, { status: 400, headers }); }
  if (input.action === "logout") {
    const response = NextResponse.json({ stage: "login" }, { headers });
    response.cookies.set(DEMO_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 0 });
    response.cookies.set(STAFF_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 0 });
    return response;
  }
  try {
    const config = await loadDemoConfig();
    if (input.action === "login") {
      if (Date.now() - windowStart >= 5 * 60 * 1000) { attempts = 0; windowStart = Date.now(); }
      if (attempts >= 10) return NextResponse.json({ error: "Too many attempts. Please try again in a few minutes." }, { status: 429, headers: { ...headers, "Retry-After": "300" } });
      attempts++;
      if (!await verifyDemoPassword(input.password, config)) return NextResponse.json({ error: "That password is incorrect. Please try again." }, { status: 401, headers });
      attempts = 0;
      return sessionResponse(request, "disclaimer", issueDemoSession("disclaimer", config));
    }
    if (input.action === "accept") {
      if (!verifyDemoSession(request.cookies.get(DEMO_COOKIE)?.value, config)) return NextResponse.json({ error: "Please sign in again.", code: "DEMO_LOGIN_REQUIRED" }, { status: 401, headers });
      if (input.accepted !== true) return NextResponse.json({ error: "Please accept the demo disclaimer before continuing." }, { status: 400, headers });
      return sessionResponse(request, "accepted", issueDemoSession("accepted", config));
    }
    return NextResponse.json({ error: "Unknown access action." }, { status: 400, headers });
  } catch { return NextResponse.json({ error: "Demo access is not configured. Ask the demo host to run the access setup.", code: "DEMO_NOT_CONFIGURED" }, { status: 503, headers }); }
}
