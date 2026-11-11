import "leaflet/dist/leaflet.css"
import { useEffect, useMemo, useState } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Chip, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { divIcon, latLngBounds } from "leaflet"
import { Backpack, Cctv, RadioTower, Server, Wifi, type LucideIcon } from "lucide-react"
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet"
import { Link } from "react-router"

import { SeverityChip } from "@/shared/components/severity-chip"
import { sourceStatusMeta } from "@/shared/config/indikasi"
import { indonesia, type MapPoint, type MapSite, type MapTone } from "@/features/devices/data/peta"
import { sourceJenisLabel, type SourceJenis } from "@/features/devices/data/sumber"
import { fungsiLabel } from "@/shared/config/fungsi-kamera"
import { locale, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"

/** From this zoom the map shows each device instead of the site. */
const DEVICE_ZOOM = 11
const SITE_ZOOM = 15

const bases = {
  // Esri's basemaps need no API key (CARTO's now do).
  peta: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  },
  satelit: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
  },
} as const
type Base = keyof typeof bases

const jenisIcon: Record<SourceJenis, LucideIcon> = { kamera: Cctv, aegis: RadioTower, manpack: Backpack, edge: Server, uplink: Wifi }
const toneBg: Record<MapTone, string> = { ok: "bg-success", warning: "bg-warning", danger: "bg-danger" }

const pointTone = (p: MapPoint): MapTone => (p.alerts.length ? "danger" : p.status === "offline" ? "danger" : p.status === "online" ? "ok" : "warning")

const svg = (Icon: LucideIcon, size: number) => renderToStaticMarkup(<Icon width={size} height={size} strokeWidth={2.25} aria-hidden />)

function siteIcon(s: MapSite) {
  return divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div class="hse-map-site ${s.tone}">
      <span class="dot ${toneBg[s.tone]}"></span>
      <span class="name">${s.nama.replace("Site ", "")}</span>
      ${s.alerts ? `<span class="count">${s.alerts}</span>` : ""}
    </div>`,
  })
}

function pointIcon(p: MapPoint) {
  const tone = pointTone(p)
  const big = p.jenis !== "kamera"
  return divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div class="hse-map-point ${tone} ${big ? "big" : ""} ${p.alerts.length ? "pulse" : ""}">${svg(jenisIcon[p.jenis], big ? 16 : 13)}</div>`,
  })
}

/** Flies to a target when it changes, and reports the zoom so the markers can switch. */
function Controller({ target, onZoom, fit }: { target: { pos: [number, number]; zoom: number; n: number } | null; onZoom: (z: number) => void; fit: [number, number][] }) {
  const map = useMap()
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  const fitKey = fit.map((p) => p.join(",")).join("|")
  useEffect(() => {
    // One site: straight to its devices. Several: the country with all of them in view.
    if (fit.length === 1) map.setView(fit[0]!, SITE_ZOOM)
    else if (fit.length) map.fitBounds(latLngBounds(fit), { padding: [60, 60], maxZoom: 6 })
    // Only when the set of sites changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  useEffect(() => {
    if (target) map.flyTo(target.pos, target.zoom, { duration: 1.2 })
  }, [map, target])
  return null
}

const clock = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })

function PointPopup({ p, onOpen }: { p: MapPoint; onOpen?: (id: string) => void }) {
  const meta = sourceStatusMeta[p.status]
  return (
    <div className="flex min-w-56 flex-col gap-2 text-sm">
      <div>
        <p className="font-semibold">{p.nama}</p>
        <p className="text-xs text-muted">
          {p.id} · {sourceJenisLabel[p.jenis]}
          {p.zona && ` · ${p.zona}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip size="sm" color={meta.color}>
          {meta.label}
        </Chip>
        {p.fungsi?.slice(0, 3).map((f) => (
          <Chip key={f} size="sm" variant="soft">
            {fungsiLabel(f)}
          </Chip>
        ))}
      </div>
      {p.alasan && p.status !== "online" && <p className="text-xs text-muted">{p.alasan}</p>}
      {p.carrier && (
        <p className="text-xs">
          {tr("Dibawa", "Carried by")}: <span className="font-medium">{p.carrier}</span>
        </p>
      )}
      {p.alerts.slice(0, 3).map((a) => (
        <Link key={a.id} to={`/indikasi?${new URLSearchParams({ site: a.site, id: a.id, periode: "today", status: "semua" })}`} className="flex items-center gap-2 rounded-md bg-danger/10 px-2 py-1 text-xs text-foreground hover:bg-danger/20">
          <SeverityChip severity={a.severity} />
          <span className="min-w-0 flex-1 truncate">{a.judul}</span>
          <span className="text-muted tabular-nums">{clock(a.waktu)}</span>
        </Link>
      ))}
      {onOpen && (
        <button type="button" onClick={() => onOpen(p.id)} className="self-start text-xs font-medium text-link hover:underline">
          {tr("Detail perangkat", "Device detail")} →
        </button>
      )}
      {p.jenis === "kamera" && (
        <Link to={`/cctv?${new URLSearchParams({ site: p.site, kamera: p.id })}`} className="text-xs font-medium text-link hover:underline">
          {tr("Lihat live", "Watch live")} →
        </Link>
      )}
    </div>
  )
}

/**
 * Indonesia with every site on it. Zoom past the sites (or pick one) and each camera, pole, Manpack
 * and server shows at its own point, coloured by status; a red pulse is an urgent indication nobody
 * has handled yet.
 */
export function SiteMap({ sites, className, onOpen }: { sites: MapSite[]; className?: string; onOpen?: (id: string) => void }) {
  const [base, setBase] = useState<Base>("peta")
  const [zoom, setZoom] = useState(indonesia.zoom)
  const [target, setTarget] = useState<{ pos: [number, number]; zoom: number; n: number } | null>(null)
  const fit = useMemo(() => sites.map((s) => s.pos), [sites])
  const go = (pos: [number, number], z: number) => setTarget((t) => ({ pos, zoom: z, n: (t?.n ?? 0) + 1 }))
  const detail = zoom >= DEVICE_ZOOM

  return (
    <div className={cn("relative isolate overflow-hidden rounded-2xl bg-default", className)}>
      <MapContainer center={indonesia.center} zoom={indonesia.zoom} minZoom={4} maxZoom={18} zoomControl={false} className="size-full" attributionControl>
        <TileLayer key={base} url={bases[base].url} attribution={bases[base].attribution} />
        <Controller target={target} onZoom={setZoom} fit={fit} />
        {!detail &&
          sites.map((s) => (
            <Marker key={s.id} position={s.pos} icon={siteIcon(s)} eventHandlers={{ click: () => go(s.pos, SITE_ZOOM) }} title={s.nama} />
          ))}
        {detail &&
          sites.flatMap((s) =>
            s.points.map((p) => (
              <Marker key={p.id} position={p.pos} icon={pointIcon(p)} title={`${p.id} · ${p.nama}`} zIndexOffset={p.alerts.length ? 1000 : p.jenis === "kamera" ? 0 : 500}>
                <Popup>
                  <PointPopup p={p} onOpen={onOpen} />
                </Popup>
              </Marker>
            )),
          )}
      </MapContainer>

      {/* Over the map: where to go, and which base layer. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          <button type="button" onClick={() => sites.length && go(indonesia.center, indonesia.zoom)} className="rounded-full bg-surface/95 px-3 py-1.5 text-sm font-medium shadow-md hover:bg-surface">
            Indonesia
          </button>
          {sites.map((s) => (
            <button key={s.id} type="button" onClick={() => go(s.pos, SITE_ZOOM)} className="flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-sm font-medium shadow-md hover:bg-surface">
              <span className={cn("size-2 rounded-full", toneBg[s.tone])} aria-hidden />
              {s.nama.replace("Site ", "")}
            </button>
          ))}
        </div>
        <ToggleButtonGroup
          aria-label={tr("Jenis peta", "Map type")}
          size="sm"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[base]}
          onSelectionChange={(k) => setBase([...k][0] as Base)}
          className="pointer-events-auto rounded-full bg-surface/95 shadow-md"
        >
          <ToggleButton id="peta">{tr("Peta", "Map")}</ToggleButton>
          <ToggleButton id="satelit">
            <ToggleButtonGroup.Separator />
            {tr("Satelit", "Satellite")}
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      <ul className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex gap-3 rounded-full bg-surface/95 px-3 py-1.5 text-xs shadow-md">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          {tr("Normal", "Normal")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warning" aria-hidden />
          {tr("Gangguan", "Degraded")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-danger" aria-hidden />
          {tr("Perlu tindakan", "Needs action")}
        </li>
      </ul>
    </div>
  )
}
