import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button, buttonVariants, Card, Drawer, Label, Meter, Skeleton, Tabs, toast } from "@heroui/react"
import { BellRing, CheckCheck, PenLine, ScanEye, VideoOff } from "lucide-react"
import { Link } from "react-router"

import { EvilBarChart } from "@/shared/charts/evilcharts/charts/recharts-bar-chart"
import { AreaEditor, AreaOverlay } from "@/features/detection/components/area-terlarang"
import { CameraDetail } from "@/features/cctv/components/camera-detail"
import { CameraTile } from "@/features/cctv/components/camera-tile"
import { Thumbnail } from "@/features/indications/components/evidence-thumbnail"
import { FilterButton, useFilters, type FilterKey } from "@/shared/components/filter-bar"
import { IndikasiDrawer } from "@/features/indications/components/indikasi-drawer"
import { KpiCard, KpiGrid } from "@/shared/components/kpi-card"
import { SeverityChip } from "@/shared/components/severity-chip"
import { REFRESH_MS, useWidgetData, WidgetBody } from "@/shared/components/widget"
import { severityMeta, type Severity } from "@/shared/config/events"
import type { Kategori } from "@/shared/config/indikasi"
import { subscribeViolations, type Violation } from "@/features/ppe/data/apd"
import { cameraStatusOf, toCamera } from "@/features/cctv/data/cctv"
import { acuanProblem, areaProblem, type AreaTerlarang } from "@/shared/config/area-terlarang"
import { saveRecord, useMaster, type Kamera } from "@/shared/data/master"
import { useRole } from "@/shared/auth/session"
import { getUseCase } from "@/features/detection/data/use-case"
import { locale, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"

const levels: Severity[] = ["kritis", "tinggi", "sedang", "rendah"]
const levelColor: Record<Severity, string> = { kritis: "var(--danger)", tinggi: "var(--chart-4)", sedang: "var(--warning)", rendah: "var(--chart-2)" }
const levelConfig = Object.fromEntries(levels.map((l) => [l, { get label() { return severityMeta[l].label }, colors: { light: [levelColor[l]], dark: [levelColor[l]] } }])) as Record<Severity, { label: string; colors: { light: string[]; dark: string[] } }>

const clock = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
const when = (d: Date) => (new Date().toDateString() === d.toDateString() ? clock(d) : d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))

function Loading() {
  return <Skeleton render={(p) => <span {...p} />} className="inline-block h-7 w-14 rounded-md align-middle" />
}

/** A still from the camera for the thumbnail strip: no video plays until it is the spotlight. */
export function StillFrame({ src, offline }: { src: string; offline: boolean }) {
  return offline ? (
    <span className="grid size-full place-items-center bg-default text-muted">
      <VideoOff className="size-4" aria-hidden />
    </span>
  ) : (
    <video src={`${src}#t=2`} preload="metadata" muted playsInline aria-hidden className="size-full object-cover" />
  )
}

export type DetectionTab = { id: string; label: string; content: ReactNode }

type Props = {
  /** One category, or several shown together. */
  kategori: Kategori | Kategori[]
  /** Replace the first two numbers (PPE shows compliance and the most-missed item). */
  firstKpi?: ReactNode
  secondKpi?: ReactNode
  /** Replaces the default trend chart. */
  trend?: ReactNode
  /** Tabs right after "Latest" (PPE: per person), and after "Zones" (PPE: hour and day). */
  tabs?: DetectionTab[]
  moreTabs?: DetectionTab[]
  filterFields?: FilterKey[]
  /** The open tab, when the page switches tabs itself (Access opens the trail from the log). */
  tab?: string
  onTabChange?: (id: string) => void
}

/**
 * One layout for every camera-based detection (PPE, restricted zones), sized to one screen on a desktop: a filter button, three numbers, then the
 * spotlight camera on the left and everything else in tabs on the right. Only the spotlight plays
 * video; a tab that runs long scrolls inside its card, never the page.
 */
export function DetectionView({ kategori, firstKpi, secondKpi, trend, tabs = [], moreTabs = [], filterFields = ["periode", "zona", "shift"], tab, onTabChange }: Props) {
  const { filters, key } = useFilters()
  const version = useWorkflowVersion()
  const query = useWidgetData(() => getUseCase(filters, kategori), key, REFRESH_MS, version)
  const d = query.data
  const kamera = new Map(useMaster().kamera.map((k) => [k.id, k]))
  const kinds = Array.isArray(kategori) ? kategori : [kategori]
  // Restricted zones show their areas on the cameras, object change its reference areas; admins can redraw them here.
  const restricted = kinds.includes("zona-terlarang")
  const acuan = kinds.includes("perubahan-objek")
  const areaKind = restricted ? "terlarang" : acuan ? "acuan" : undefined
  const areaOf = (k?: Kamera) => (restricted ? k?.area : acuan ? k?.acuan : undefined)
  const overlay = (id: string, compact?: boolean, className?: string) => areaKind && <AreaOverlay area={areaOf(kamera.get(id))} tone={acuan ? "accent" : "danger"} compact={compact} className={className} />
  const role = useRole()
  const canDraw = !!areaKind && (role === "super-admin" || role === "admin-site")
  const [editing, setEditing] = useState<{ k: Kamera; area?: AreaTerlarang } | null>(null)
  const [saving, setSaving] = useState(false)

  const [picked, setPicked] = useState<string | null>(null)
  const [flash, setFlash] = useState<Violation | undefined>()
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [openId, setOpenId] = useState<string>()
  const [isOpen, setIsOpen] = useState(false)
  const [bigOpen, setBigOpen] = useState(false)

  const cams = (d?.cameras ?? []).flatMap((c) => {
    const k = kamera.get(c.id)
    return k ? [{ ...c, camera: toCamera(k), status: cameraStatusOf(c.id) }] : []
  })
  // The spotlight: what the user picked, else the camera with the newest Kritis/Tinggi, else the busiest.
  const urgentCam = d?.rows.find((e) => severityMeta[e.severity].rank <= 1 && cams.some((c) => c.id === e.kamera))?.kamera
  const focusId = picked && cams.some((c) => c.id === picked) ? picked : (urgentCam ?? cams.find((c) => c.status.online)?.id ?? cams[0]?.id)
  const focus = cams.find((c) => c.id === focusId)
  const latestOnFocus = d?.rows.find((e) => e.kamera === focusId)
  const latest = d?.rows.slice(0, 12) ?? []

  // PPE detections stream live: the spotlight jumps to the camera that just caught one.
  const camIds = cams.map((c) => c.id).join(",")
  useEffect(() => {
    if (kategori !== "apd") return
    const off = subscribeViolations(filters, (v) => {
      if (!camIds.split(",").includes(v.kamera)) return
      setPicked(v.kamera)
      setFlash(v)
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(undefined), 12_000)
    })
    return () => {
      off()
      clearTimeout(flashTimer.current)
    }
    // Remounted by the page on a filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kategori, camIds])

  const single = Array.isArray(kategori) ? (kategori.length === 1 ? kategori[0] : undefined) : kategori
  const register = `/indikasi?${new URLSearchParams({ site: filters.site, ...(single ? { kategori: single } : {}), periode: filters.periode, status: "semua", ...(filters.zona !== "all" ? { zona: filters.zona } : {}) })}`
  const review = (id: string, cam?: string) => {
    if (cam) setPicked(cam)
    setOpenId(id)
    setIsOpen(true)
  }

  const allTabs: DetectionTab[] = [
    {
      id: "terbaru",
      label: tr("Terbaru", "Latest"),
      content: (
        <WidgetBody query={query} skeleton={<Skeleton className="h-48 rounded-lg" />} isEmpty={(x) => !x.rows.length} empty={tr("Belum ada deteksi.", "No detections yet.")}>
          {() => (
            <ol className="flex flex-col gap-1">
              {latest.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => review(e.id, e.kamera)} className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-default">
                    <Thumbnail e={e} label={false} className="w-24 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.judul}</span>
                      <span className="block truncate text-xs text-muted">
                        {e.zona.label} · {when(e.waktu)}
                      </span>
                    </span>
                    <SeverityChip severity={e.severity} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </WidgetBody>
      ),
    },
    ...tabs,
    {
      id: "tren",
      label: tr("Tren", "Trend"),
      content: trend ?? (
        <WidgetBody query={query} skeleton={<Skeleton className="h-56 rounded-lg" />} isEmpty={(x) => !x.rows.length} empty={tr("Belum ada deteksi.", "No detections yet.")}>
          {(x) => (
            <EvilBarChart data={x.buckets} config={levelConfig} stackType="stacked" className="aspect-auto h-full min-h-56">
              <EvilBarChart.Grid />
              <EvilBarChart.XAxis dataKey="label" />
              <EvilBarChart.YAxis allowDecimals={false} />
              <EvilBarChart.Tooltip />
              {levels.map((l) => (
                <EvilBarChart.Bar key={l} dataKey={l} />
              ))}
            </EvilBarChart>
          )}
        </WidgetBody>
      ),
    },
    {
      id: "zona",
      label: tr("Zona", "Zones"),
      content: (
        <WidgetBody query={query} skeleton={<Skeleton className="h-40 rounded-lg" />} isEmpty={(x) => !x.zones.length} empty={tr("Belum ada deteksi.", "No detections yet.")}>
          {(x) => (
            <ol className="flex flex-col gap-1">
              {x.zones.map((z) => (
                <li key={z.id}>
                  <Link to={z.href} className="block rounded-lg p-2 hover:bg-default">
                    <Meter value={z.count} maxValue={x.zones[0]!.count} valueLabel={String(z.count)} size="sm" color={z.urgent ? "danger" : "accent"}>
                      <Label>{z.label}</Label>
                      <Meter.Output />
                      <Meter.Track>
                        <Meter.Fill />
                      </Meter.Track>
                    </Meter>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </WidgetBody>
      ),
    },
    ...moreTabs,
  ]

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:min-h-[34rem]">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={filterFields} />
        <Link to={register} className={buttonVariants({ size: "sm", variant: "tertiary", className: "ms-auto" })}>
          {tr("Semua indikasi", "All indications")}
        </Link>
      </div>

      <KpiGrid>
        {firstKpi ?? <KpiCard compact icon={ScanEye} label={tr("Deteksi", "Detections")} value={d ? d.rows.length : <Loading />} />}
        {secondKpi ?? <KpiCard compact icon={BellRing} label={tr("Kritis / Tinggi", "Critical / High")} value={d ? d.urgent : <Loading />} tone={d?.urgent ? "danger" : "default"} />}
        <KpiCard compact icon={CheckCheck} label={tr("Belum ditinjau", "Not reviewed")} value={d ? d.waiting : <Loading />} tone={d?.slaMissed ? "warning" : "default"} note={d?.slaMissed ? tr(`${d.slaMissed} lewat SLA`, `${d.slaMissed} past SLA`) : undefined} />
      </KpiGrid>

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        {/* Left: the spotlight fills what height is left, the stills sit under it. */}
        <Card className="min-w-0 lg:min-h-0">
          <Card.Content className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
            <div className="relative aspect-video lg:aspect-auto lg:min-h-0 lg:flex-1">
              {!d ? (
                <Skeleton className="size-full rounded-lg" />
              ) : !focus ? (
                <p className="grid size-full place-items-center rounded-lg bg-default text-sm text-muted">{tr("Belum ada kamera yang menjalankan deteksi ini.", "No camera runs this detection yet.")}</p>
              ) : (
                <>
                  <CameraTile key={focus.id} camera={focus.camera} status={focus.status} fill alert={flash?.kamera === focus.id ? flash : undefined} onOpen={() => setBigOpen(true)} onDismissAlert={() => setFlash(undefined)} />
                  {overlay(focus.id, false, "rounded-lg")}
                  {canDraw && (
                    <Button size="sm" variant="secondary" className="absolute top-2 right-2 z-20" onPress={() => setEditing({ k: kamera.get(focus.id)!, area: areaOf(kamera.get(focus.id)) })}>
                      <PenLine aria-hidden />
                      {acuan ? tr("Atur acuan", "Set reference") : tr("Atur area", "Set areas")}
                    </Button>
                  )}
                  {!flash && latestOnFocus && (
                    <button type="button" onClick={() => review(latestOnFocus.id)} className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-lg bg-black/65 px-2.5 py-1.5 text-left text-sm text-white hover:bg-black/80">
                      <SeverityChip severity={latestOnFocus.severity} />
                      <span className="min-w-0 flex-1 truncate">{latestOnFocus.judul}</span>
                      <span className="text-xs text-white/80 tabular-nums">{when(latestOnFocus.waktu)}</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {cams.length > 1 && (
              <ul className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label={tr("Kamera lain", "Other cameras")}>
                {cams.map((c) => (
                  <li key={c.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setPicked(c.id)}
                      aria-pressed={c.id === focusId}
                      className={cn("flex w-32 flex-col gap-1 rounded-lg p-1 text-left hover:bg-default", c.id === focusId && "bg-default ring-2 ring-accent")}
                    >
                      <span className="relative block aspect-video overflow-hidden rounded-md bg-black">
                        <StillFrame src={c.camera.streamUrl} offline={!c.status.online} />
                        {c.status.online && overlay(c.id, true)}
                        {c.count > 0 && <span className="absolute top-1 right-1 rounded-full bg-danger px-1.5 text-[11px] font-medium text-danger-foreground tabular-nums">{c.count}</span>}
                      </span>
                      <span className="flex items-center gap-1.5 px-0.5 text-xs">
                        <span className={cn("size-1.5 shrink-0 rounded-full", c.status.online ? "bg-success" : "bg-danger")} aria-hidden />
                        <span className="truncate">{c.camera.label.replace(`${c.id} · `, "")}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
        </Card>

        {/* Right: everything else, one tab at a time, scrolling inside the card. */}
        <Card className="min-w-0 lg:min-h-0">
          <Card.Content className="flex flex-col lg:min-h-0 lg:flex-1">
            <Tabs className="flex flex-col lg:min-h-0 lg:flex-1" {...(tab ? { selectedKey: tab, onSelectionChange: (k) => onTabChange?.(String(k)) } : {})}>
              <Tabs.ListContainer>
                <Tabs.List aria-label={tr("Detail deteksi", "Detection detail")}>
                  {allTabs.map((t) => (
                    <Tabs.Tab key={t.id} id={t.id} className="whitespace-nowrap">
                      {t.label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              {allTabs.map((t) => (
                <Tabs.Panel key={t.id} id={t.id} className="max-h-[28rem] overflow-y-auto pt-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                  {t.content}
                </Tabs.Panel>
              ))}
            </Tabs>
          </Card.Content>
        </Card>
      </div>

      <IndikasiDrawer filters={filters} id={openId} isOpen={isOpen} onOpenChange={setIsOpen} />
      <CameraDetail camera={focus?.camera} status={focus?.status} isOpen={bigOpen} onOpenChange={setBigOpen} />

      <Drawer.Backdrop isOpen={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{acuan ? tr("Atur area acuan", "Set reference areas") : tr("Atur area terlarang", "Set restricted areas")}</Drawer.Heading>
              {editing && (
                <p className="text-sm text-muted">
                  {editing.k.id} · {editing.k.nama}
                </p>
              )}
            </Drawer.Header>
            <Drawer.Body>{editing && <AreaEditor kind={areaKind} value={editing.area} src={editing.k.streamUrl} onChange={(area) => setEditing({ ...editing, area })} />}</Drawer.Body>
            <Drawer.Footer>
              <Button slot="close" variant="secondary">
                {tr("Batal", "Cancel")}
              </Button>
              <Button
                isPending={saving}
                onPress={async () => {
                  if (!editing) return
                  const problem = acuan ? acuanProblem(editing.area) : areaProblem(editing.area)
                  if (problem) return toast.danger(problem)
                  setSaving(true)
                  await saveRecord("kamera", acuan ? { ...editing.k, acuan: editing.area } : { ...editing.k, area: editing.area })
                  setSaving(false)
                  toast.success(acuan ? tr(`Acuan ${editing.k.id} disimpan. Gambar sekarang jadi acuan baru.`, `Reference for ${editing.k.id} saved. The current picture is the new reference.`) : tr(`Area ${editing.k.id} disimpan.`, `Areas for ${editing.k.id} saved.`))
                  setEditing(null)
                }}
              >
                {tr("Simpan", "Save")}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  )
}
