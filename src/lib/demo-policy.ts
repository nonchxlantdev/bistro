export const DEMO_POLICY_VERSION = "2026-11-18";
export const DEMO_COOKIE = "salud_demo_session";
export const ACCESS_PAGES = ["/login", "/disclaimer", "/welcome"];

export const DEMO_NOTICES = [
  { title: "A demonstration, still in development", text: "Salud Bistro is a demo restaurant powered by Vision Forge Studio. This system is provided solely to explore and evaluate its features. It is not a final product and is not ready for live restaurant operations." },
  { title: "Sample service and simulated payments", text: "Orders, guest checks, receipts and reports are for demonstration purposes. Recording a payment does not move money. Do not use this system to process real sales, accept real payments, or produce official accounting or tax records." },
  { title: "Use demo information only", text: "Do not enter real customer details, card information, passwords or other sensitive information. Changes may be visible to other demo users, may persist between visits, and may be changed or reset as development continues." },
  { title: "Features may change", text: "Features may be incomplete or contain errors. Availability, totals and reports should not be relied on for business decisions. The interface and functionality may change before a final release." },
] as const;

export function safeDemoDestination(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/dashboard";
  try { const decoded = decodeURIComponent(value); if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return "/dashboard"; } catch { return "/dashboard"; }
  const path = value.split(/[?#]/)[0];
  if (ACCESS_PAGES.some((page) => path === page || path.startsWith(page + "/")) || path === "/api" || path.startsWith("/api/")) return "/dashboard";
  return value;
}
