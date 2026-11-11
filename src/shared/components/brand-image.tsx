import { useState, type ReactNode } from "react"

import type { AssetRef } from "@/shared/config/defaults"

/**
 * A logo or icon from Pengaturan. Always an <img>, never inlined markup, so a script inside an
 * uploaded SVG can't run. Missing or broken images show `fallback` instead.
 */
export function BrandImage({ asset, className, fallback = null }: { asset: AssetRef | null; className?: string; fallback?: ReactNode }) {
  const [broken, setBroken] = useState<string | null>(null)
  if (!asset || broken === asset.url) return fallback
  // Decorative: the app name is always written next to it.
  return <img src={asset.url} alt="" className={className} onError={() => setBroken(asset.url)} />
}

/** The square mark beside the app name: app icon, else logo, else the name's first letter. */
export function BrandMark({ brand, className }: { brand: { appName: string; logo: AssetRef | null; appIcon: AssetRef | null }; className: string }) {
  const initial = (
    <span aria-hidden className={`${className} grid place-items-center rounded-[5px] bg-brand-accent text-[11px] leading-none font-semibold text-brand-accent-foreground`}>
      {brand.appName.match(/[\p{L}\p{N}]/u)?.[0].toUpperCase()}
    </span>
  )
  return <BrandImage asset={brand.appIcon ?? brand.logo} className={`${className} object-contain`} fallback={initial} />
}
