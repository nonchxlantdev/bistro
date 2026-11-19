import { NextResponse, type NextRequest } from "next/server";
import { loadDemoConfig, verifyDemoSession } from "@/lib/auth/demo-access";
import { ACCESS_PAGES, DEMO_COOKIE, STAFF_FREE_PATHS, safeDemoDestination } from "@/lib/demo-policy";
import { STAFF_COOKIE, verifyStaffSession } from "@/lib/auth/staff-session";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/demo-access") return NextResponse.next();
  const publicPage = ACCESS_PAGES.includes(pathname);
  let stage: "login" | "disclaimer" | "accepted" = "login";
  let staffSignedIn = false;
  try {
    const config = await loadDemoConfig();
    stage = verifyDemoSession(request.cookies.get(DEMO_COOKIE)?.value, config)?.stage ?? "login";
    staffSignedIn = Boolean(verifyStaffSession(request.cookies.get(STAFF_COOKIE)?.value, config));
  } catch {
    // The login screen can explain a missing local configuration without exposing data.
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Demo access has not been configured. Ask the demo host to configure access.", code: "DEMO_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const destination = safeDemoDestination(request.nextUrl.searchParams.get("next"));
  let redirect: string | undefined;
  if (stage === "login" && pathname !== "/login") redirect = "/login";
  if (stage === "disclaimer" && pathname !== "/disclaimer") redirect = "/disclaimer";
  if (stage === "accepted" && (pathname === "/login" || pathname === "/disclaimer")) redirect = "/welcome";
  // After the demo gate, every screen and API needs a staff sign-in (tap name + PIN).
  if (stage === "accepted" && !redirect && !staffSignedIn && !STAFF_FREE_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"))) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in with your name and PIN to continue.", code: "STAFF_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    redirect = "/staff";
  }
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
