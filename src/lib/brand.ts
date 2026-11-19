/** Restaurant presentation stays separate from the underlying platform. */
export const DEMO_BRAND = {
  name: "Salud Bistro",
  title: "Salud Bistro — Demo",
  environment: "Demo Environment",
  location: "Main Branch",
  platform: "Vision Forge Studio",
  logo: "/branding/salud-bistro-logo-alpha.png",
  wordmark: "/branding/salud-bistro-wordmark-alpha.png",
} as const;

/** Upgrade the original sample identity on display; keep custom restaurant names. */
export function demoReceiptName(name: string) {
  return /^demo caf[eé]$/i.test(name.trim()) ? DEMO_BRAND.name : name;
}
export function demoReceiptFooter(footer: string) {
  return footer.replace(/demo caf[eé]/gi, DEMO_BRAND.name);
}
