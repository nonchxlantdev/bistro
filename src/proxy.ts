import { NextResponse, type NextRequest } from "next/server";
import { loadDemoConfig, verifyDemoSession } from "@/lib/auth/demo-access";
import { ACCESS_PAGES, DEMO_COOKIE, safeDemoDestination } from "@/lib/demo-policy";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/demo-access") return NextResponse.next();
  const publicPage = ACCESS_PAGES.includes(pathname);
  let stage: "login" | "disclaimer" | "accepted" = "login";
  try {
    stage = verifyDemoSession(request.cookies.get(DEMO_COOKIE)?.value, await loadDemoConfig())?.stage ?? "login";
  } catch {
    // The login screen can explain a missing local configuration without exposing data.
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Demo access has not been configured. Ask the demo host to configure access.", code: "DEMO_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const destination = safeDemoDestination(request.nextUrl.searchParams.get("next"));
  let redirect: string | undefined;
  if (stage === "login" && pathname !== "/login") redirect = "/login";
  if (stage === "disclaimer" && pathname !== "/disclaimer") redirect = "/disclaimer";
  if (stage === "accepted" && (pathname === "/login" || pathname === "/disclaimer")) redirect = "/welcome";
  if (redirect && pathname.startsWith("/api/")) return NextResponse.json({ error: stage === "login" ? "Sign in to continue the demo." : "Accept the demo disclaimer to continue.", code: stage === "login" ? "DEMO_LOGIN_REQUIRED" : "DEMO_ACCEPTANCE_REQUIRED" }, { status: stage === "login" ? 401 : 403, headers: { "Cache-Control": "no-store" } });
  if (redirect) {
    const url = new URL(redirect, request.url);
    url.searchParams.set("next", publicPage ? destination : safeDemoDestination(pathname + request.nextUrl.search));
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|branding/|favicon\\.ico$).*)"] };
