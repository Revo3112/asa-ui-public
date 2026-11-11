/**
 * What the site and zona filters cover, shared by every dummy data module.
 * With one site the zona filter holds a zone id. With "Semua site" a zone name can repeat
 * across sites, so the filter holds a `site/zona` pair and labels read "Gudang · Site Cikarang".
 */

import { activeShifts, shiftLabel, siteName, zoneName, zonesOfSite } from "@/shared/data/master"
import type { Filters, Option } from "@/shared/data/filters"
import { userSites } from "@/shared/auth/session"
import { tr } from "@/shared/lib/i18n"

/** The sites a filter covers: one, or every site the user may see. */
export const sitesIn = (f: Pick<Filters, "site">) => (f.site === "all" ? userSites() : [f.site])

/** Whether something at this site and zone passes the site and zona filters. */
export const inPlace = (f: Pick<Filters, "site" | "zona">) => {
  const sites = sitesIn(f)
  return (site: string, zona: string) => sites.includes(site) && (f.zona === "all" || f.zona === zona || f.zona === `${site}/${zona}`)
}

/** The zona filter value that picks this place. */
export const placeId = (f: Pick<Filters, "site">, site: string, zona: string) => (f.site === "all" ? `${site}/${zona}` : zona)

/** "Gudang", or "Gudang · Site Cikarang" when the view spans sites. */
export const placeLabel = (f: Pick<Filters, "site">, site: string, zona: string) => (f.site === "all" ? `${zoneName(zona)} · ${siteName(site)}` : zoneName(zona))

/** A copy of the record with its zona labelled for this view. */
export const placed =
  (f: Pick<Filters, "site">) =>
  <T extends { site: string; zona: Option }>(row: T): T => ({ ...row, zona: { id: row.zona.id, label: placeLabel(f, row.site, row.zona.id) } })

/** Every site + zone pair the filters cover, in master order. */
export const placesIn = (f: Pick<Filters, "site" | "zona">) => {
  const keep = inPlace(f)
  return sitesIn(f).flatMap((site) =>
    zonesOfSite(site)
      .filter((z) => keep(site, z.id))
      .map((z) => ({ site, zona: z.id })),
  )
}

export function siteOptions(): Option[] {
  const sites = userSites().map((id) => ({ id, label: siteName(id) }))
  return sites.length > 1 ? [{ id: "all", label: tr("Semua site", "All sites") }, ...sites] : sites
}

/** The zones of the picked site, or every site + zone pair when the site is "all". */
export function zoneOptions(site: string): Option[] {
  const f = { site, zona: "all" }
  return [{ id: "all", label: tr("Semua zona", "All zones") }, ...placesIn(f).map((p) => ({ id: placeId(f, p.site, p.zona), label: placeLabel(f, p.site, p.zona) }))]
}

export const shiftOptions = (): Option[] => [{ id: "all", label: tr("Semua shift", "All shifts") }, ...activeShifts().map((s) => ({ id: s.id, label: shiftLabel(s.id) }))]
