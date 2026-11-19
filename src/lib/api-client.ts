export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) {
    if (typeof window !== "undefined" && body.code === "STAFF_REQUIRED" && !url.startsWith("/api/staff")) {
      window.location.replace(`/staff?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    if (typeof window !== "undefined" && url !== "/api/demo-access" && (body.code === "DEMO_LOGIN_REQUIRED" || body.code === "DEMO_ACCEPTANCE_REQUIRED")) {
      window.location.replace(`${body.code === "DEMO_LOGIN_REQUIRED" ? "/login" : "/disclaimer"}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ApiError(body.error ?? "Request failed.");
  }
  return body as T;
}
