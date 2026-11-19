import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { createDemoConfig, demoConfigPath, issueDemoSession, SESSION_SECONDS, verifyDemoPassword, verifyDemoSession, type DemoAccessConfig } from "@/lib/auth/demo-access";
import { DEMO_COOKIE, safeDemoDestination } from "@/lib/demo-policy";
import { GET, POST } from "@/app/api/demo-access/route";
import { proxy, config as proxyConfig } from "@/proxy";
import { issueStaffSession, STAFF_COOKIE } from "@/lib/auth/staff-session";

let folder: string;
let config: DemoAccessConfig;
const password = "isolated-test-password";
const origin = "http://localhost:3000";
function request(url: string, body?: unknown, cookie?: string, headers?: Record<string, string>) {
  return new NextRequest(origin + url, { ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }), headers: { ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: origin }), ...(cookie ? { Cookie: `${DEMO_COOKIE}=${cookie}` } : {}), ...headers } });
}
function cookie(response: Response) { return response.headers.get("set-cookie")!.split(";")[0].split("=").slice(1).join("="); }

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "salud-access-test-"));
  vi.stubEnv("SORA_DATA_DIR", folder);
  config = await createDemoConfig(password);
  await writeFile(demoConfigPath(), JSON.stringify(config));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (path.dirname(folder) !== tmpdir() || !path.basename(folder).startsWith("salud-access-test-")) throw new Error("Unexpected test cleanup path");
  await rm(folder, { recursive: true, force: true });
});

describe("demo access", () => {
  it("matches application and image routes while leaving login assets available", () => {
    for (const url of ["/pos", "/api/orders", "/api/product-images/food.jpg", "/_next/image?url=%2Fapi%2Fproduct-images%2Ffood.jpg&w=256&q=75"]) expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url })).toBe(true);
    for (const url of ["/_next/static/chunks/main.js", "/branding/salud-bistro-wordmark.png", "/favicon.ico"]) expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url })).toBe(false);
  });
  it("stores a salted hash and validates the password without exposing it", async () => {
    expect(JSON.stringify(config)).not.toContain(password);
    expect(await verifyDemoPassword(password, config)).toBe(true);
    expect(await verifyDemoPassword("wrong", config)).toBe(false);
    expect(await verifyDemoPassword(null, config)).toBe(false);
    expect(await verifyDemoPassword("x".repeat(257), config)).toBe(false);
  });
  it("rejects tampering, expired cookies and rotated secrets", () => {
    const now = Date.now();
    const token = issueDemoSession("accepted", config, now);
    expect(verifyDemoSession(token, config, now)?.stage).toBe("accepted");
    expect(verifyDemoSession(token + "x", config, now)).toBeNull();
    expect(verifyDemoSession(token, config, now + SESSION_SECONDS * 1000)).toBeNull();
    expect(verifyDemoSession(token, { ...config, signingSecret: "a".repeat(64) }, now)).toBeNull();
    expect(verifyDemoSession("invalid", config, now)).toBeNull();
  });
  it("requires password then explicit disclaimer acceptance and issues an HttpOnly cookie", async () => {
    const wrong = await POST(request("/api/demo-access", { action: "login", password: "wrong" }));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const login = await POST(request("/api/demo-access", { action: "login", password }));
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=strict");
    expect(verifyDemoSession(cookie(login), config)?.stage).toBe("disclaimer");
    const noAcceptance = await POST(request("/api/demo-access", { action: "accept", accepted: false }, cookie(login)));
    expect(noAcceptance.status).toBe(400);
    const accepted = await POST(request("/api/demo-access", { action: "accept", accepted: true }, cookie(login)));
    expect(verifyDemoSession(cookie(accepted), config)?.stage).toBe("accepted");
    expect(await (await GET(request("/api/demo-access", undefined, cookie(accepted)))).json()).toEqual({ stage: "accepted" });
    expect((await POST(request("/api/demo-access", { action: "accept", accepted: true }))).status).toBe(401);
  });
  it("protects app pages, APIs and image data until acceptance", async () => {
    const unauthenticated = await proxy(request("/tables"));
    expect(unauthenticated.headers.get("location")).toBe(origin + "/login?next=%2Ftables");
    expect((await proxy(request("/api/orders"))).status).toBe(401);
    expect((await proxy(request("/api/product-images/example.jpg"))).status).toBe(401);
    const waiting = issueDemoSession("disclaimer", config);
    expect((await proxy(request("/api/orders", undefined, waiting))).status).toBe(403);
    expect((await proxy(request("/pos", undefined, waiting))).headers.get("location")).toContain("/disclaimer?");
    expect((await proxy(request("/welcome", undefined, waiting))).headers.get("location")).toContain("/disclaimer?");
    const accepted = issueDemoSession("accepted", config);
    // After the disclaimer, staff must sign in (tap name + PIN) before the app or its APIs.
    const noStaff = await proxy(request("/api/orders", undefined, accepted));
    expect(noStaff.status).toBe(401);
    expect((await noStaff.json()).code).toBe("STAFF_REQUIRED");
    expect((await proxy(request("/pos", undefined, accepted))).headers.get("location")).toContain("/staff?next=%2Fpos");
    expect((await proxy(request("/staff", undefined, accepted))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/api/staff", undefined, accepted))).headers.get("x-middleware-next")).toBe("1");
    const staff = issueStaffSession({ id: "staff_test", name: "Test", role: "SERVER" }, config);
    const both = { Cookie: `${DEMO_COOKIE}=${accepted}; ${STAFF_COOKIE}=${staff}` };
    expect((await proxy(request("/api/orders", undefined, undefined, both))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/pos", undefined, undefined, both))).headers.get("Cache-Control")).toBe("no-store");
    const forged = { Cookie: `${DEMO_COOKIE}=${accepted}; ${STAFF_COOKIE}=${staff.slice(0, -2)}xx` };
    expect((await proxy(request("/api/orders", undefined, undefined, forged))).status).toBe(401);
    expect((await proxy(request("/login", undefined, accepted))).headers.get("location")).toContain("/welcome?");
  });
  it("clears access on logout and checks request origins", async () => {
    const logout = await POST(request("/api/demo-access", { action: "logout" }));
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await POST(request("/api/demo-access", { action: "login", password }, undefined, { Origin: "https://another.example" }))).status).toBe(403);
    expect((await POST(request("/api/demo-access", { action: "login", password }, undefined, { "Content-Type": "text/plain" }))).status).toBe(415);
  });
  it("uses secure cookies over HTTPS", async () => {
    const login = await POST(new NextRequest("https://demo.example/api/demo-access", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://demo.example" }, body: JSON.stringify({ action: "login", password }) }));
    expect(login.headers.get("set-cookie")).toContain("Secure");
  });
  it("rejects off-site and access-page return destinations", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/%5cevil.example", "/%2f%2fevil.example", "/login", "/disclaimer?next=/pos", "/api/orders", "/pos\n"]) expect(safeDemoDestination(value)).toBe("/dashboard");
    expect(safeDemoDestination("/pos?orderId=sample")).toBe("/pos?orderId=sample");
  });
  it("throttles repeated incorrect passwords", async () => {
    for (let index = 0; index < 10; index++) expect((await POST(request("/api/demo-access", { action: "login", password: "wrong" }))).status).toBe(401);
    const limited = await POST(request("/api/demo-access", { action: "login", password }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("300");
  });
});
