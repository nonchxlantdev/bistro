import { DEMO_BRAND } from "@/lib/brand";

export function BrandLogo({ className = "size-24", wordmark = false }: { className?: string; wordmark?: boolean }) {
  const source = wordmark ? DEMO_BRAND.wordmark : DEMO_BRAND.logo;
  // The original white-on-black artwork is the luminance mask: black becomes
  // transparent and the exact lettering takes the surrounding text color.
  return <span role="img" aria-label="Salud Bistro official logo" className={`inline-block shrink-0 ${className}`} style={{
    aspectRatio: wordmark ? "599 / 332" : "848 / 855",
    backgroundColor: "currentColor",
    maskImage: `url("${source}")`,
    maskMode: "luminance",
    maskSize: "contain",
    maskPosition: "center",
    maskRepeat: "no-repeat",
  }} />;
}
