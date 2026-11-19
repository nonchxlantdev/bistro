import type { CSSProperties } from "react";
import { DEMO_BRAND } from "@/lib/brand";

/**
 * Official Salud Bistro artwork, tinted with the surrounding text colour.
 * The transparent (alpha) PNG is used as an alpha mask with -webkit- prefixes, which every
 * current and older tablet browser supports. A hidden <img> gives the element its size, so it
 * does not depend on CSS aspect-ratio. Without mask support the plain logo image is shown.
 */
export function BrandLogo({ className = "size-24", wordmark = false }: { className?: string; wordmark?: boolean }) {
  const source = wordmark ? DEMO_BRAND.wordmark : DEMO_BRAND.logo;
  const width = wordmark ? 599 : 848;
  const height = wordmark ? 332 : 855;
  return <span role="img" aria-label="Salud Bistro official logo" className={`brand-logo shrink-0 ${className}`} style={{ "--brand-logo": `url("${source}")` } as CSSProperties}>
    {/* eslint-disable-next-line @next/next/no-img-element -- sizing element only */}
    <img src={source} alt="" aria-hidden="true" width={width} height={height} decoding="async" />
  </span>;
}
