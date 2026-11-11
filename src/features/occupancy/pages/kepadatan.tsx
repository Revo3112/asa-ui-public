import { useState, useSyncExternalStore } from "react"
import { Button, Card, Label, Meter, Skeleton, Tabs } from "@heroui/react"
import { Megaphone, TriangleAlert, Users } from "lucide-react"

import { EvilLineChart } from "@/shared/charts/evilcharts/charts/recharts-line-chart"
import { CameraDetail } from "@/features/cctv/components/camera-detail"
import { CameraTile } from "@/features/cctv/components/camera-tile"
import { cameraStatusOf, toCamera } from "@/features/cctv/data/cctv"
import { StillFrame } from "@/features/detection/components/detection-view"
import { getKepadatan, headcounts, startDrill, stopDrill, subscribeDrills, type KepadatanData } from "@/features/occupancy/data/kepadatan"
import { FilterButton, useFilters } from "@/shared/components/filter-bar"
import { KpiCard, KpiGrid } from "@/shared/components/kpi-card"
import { REFRESH_MS, useWidgetData, WidgetBody, type WidgetQuery } from "@/shared/components/widget"
import { useMaster } from "@/shared/data/master"
import { locale, tr } from "@/shared/lib/i18n"
import { useNow } from "@/shared/lib/time"
import { cn } from "@/shared/lib/utils"

const num = (n: number) => n.toLocaleString(locale())
const clock = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })

function Loading() {
  return <Skeleton render={(p) => <span {...p} />} className="inline-block h-7 w-14 rounded-md align-middle" />
}

/** Re-renders while a drill runs, so the headcount climbs on screen. */
function useDrills() {
  const version = useSyncExternalStore(subscribeDrills, () => drillVersion, () => drillVersion)
  useNow(1_000)
  return version
}
let drillVersion = 0
subscribeDrills(() => drillVersion++)

/** Every counted zone against its capacity, fullest first. */
function ZonesTab({ query, onPick }: { query: WidgetQuery<KepadatanData>; onPick: (kamera: string) => void }) {
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-48 rounded-lg" />} isEmpty={(d) => !d.zones.length} empty={tr("Belum ada zona yang dihitung di lingkup ini.", "No counted zone in this scope yet.")}>
      {(d) => (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-1">
            {d.zones.map((z) => {
              const over = z.count > z.kapasitas
              return (
                <li key={`${z.site}/${z.zona}`}>
                  <button type="button" onClick={() => z.kamera[0] && onPick(z.kamera[0])} className="block w-full rounded-lg p-2 text-left hover:bg-default">
                    <Meter value={Math.min(z.count, z.kapasitas)} maxValue={z.kapasitas} valueLabel={`${z.count}/${z.kapasitas}`} size="sm" color={over ? "danger" : z.count >= z.kapasitas * 0.85 ? "warning" : "accent"}>
                      <Label>{z.label}</Label>
                      <Meter.Output />
                      <Meter.Track>
                        <Meter.Fill />
                      </Meter.Track>
                    </Meter>
                    {z.lewatSejak && <p className="mt-1 text-xs text-danger">{tr(`Lewat kapasitas sejak ${clock(z.lewatSejak)}`, `Over capacity since ${clock(z.lewatSejak)}`)}</p>}
                  </button>
                </li>
              )
            })}
          </ol>
          {d.lewat.length > 0 && (
            <section className="flex flex-col gap-1">
              <p className="text-sm font-medium">{tr("Lewat kapasitas hari ini", "Over capacity today")}</p>
              <ul className="flex flex-col text-sm">
                {d.lewat.slice(0, 8).map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 px-2 py-1">
                    <span className="truncate">{l.label}</span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {clock(l.from)}–{l.to ? clock(l.to) : tr("sekarang", "now")} · {tr(`puncak ${l.puncak}/${l.kapasitas}`, `peak ${l.puncak}/${l.kapasitas}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </WidgetBody>
  )
}

const arusConfig = {
  masuk: { get label() { return tr("Masuk", "In") }, colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
  keluar: { get label() { return tr("Keluar", "Out") }, colors: { light: ["var(--chart-3)"], dark: ["var(--chart-3)"] } },
}

/** People in and out per hour today: shift change shows as the two peaks. */
function FlowTab({ query }: { query: WidgetQuery<KepadatanData> }) {
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-56 rounded-lg" />} isEmpty={(d) => !d.arus.some((p) => p.masuk || p.keluar)} empty={tr("Belum ada pergerakan hari ini.", "No movement today yet.")}>
      {(d) => (
        <EvilLineChart data={d.arus} config={arusConfig} className="aspect-auto h-full min-h-56">
          <EvilLineChart.Grid />
          <EvilLineChart.XAxis dataKey="jam" />
          <EvilLineChart.YAxis allowDecimals={false} />
          <EvilLineChart.Tooltip />
          <EvilLineChart.Legend />
          <EvilLineChart.Line dataKey="masuk" strokeWidth={2} />
          <EvilLineChart.Line dataKey="keluar" strokeWidth={2} />
        </EvilLineChart>
      )}
    </WidgetBody>
  )
}

/** The evacuation headcount: who the gates say is inside, against who reached the muster point. */
function MusterTab() {
  // Reads the drill store during render, which the React Compiler would cache.
  "use no memo"
  const { filters } = useFilters()
  useDrills()
  const list = headcounts(filters)
  if (!list.length) return <p className="text-sm text-muted">{tr("Belum ada titik kumpul di lingkup ini.", "No muster point in this scope yet.")}</p>
  return (
    <div className="flex flex-col gap-5">
      {list.map((h) => {
        // Settled once everyone who will arrive has: the rest are listed as missing.
        const settled = h.state !== "siap" && h.missing.length + h.counted === h.expected
        return (
          <section key={h.titik.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{h.label}</p>
                <p className="text-xs text-muted">
                  {h.state === "siap"
                    ? tr(`${num(h.expected)} orang tercatat di dalam site (dari gerbang)`, `${num(h.expected)} people recorded inside the site (from the gates)`)
                    : tr(`Simulasi dimulai ${clock(h.startedAt!)}`, `Drill started ${clock(h.startedAt!)}`)}
                </p>
              </div>
              {h.state === "berjalan" ? (
                <Button size="sm" variant="secondary" onPress={() => stopDrill(h.titik.site)}>
                  {tr("Akhiri simulasi", "End drill")}
                </Button>
              ) : (
                <Button size="sm" variant={h.state === "siap" ? "primary" : "secondary"} onPress={() => startDrill(h.titik.site)}>
                  <Megaphone aria-hidden />
                  {h.state === "siap" ? tr("Mulai simulasi evakuasi", "Start evacuation drill") : tr("Ulangi simulasi", "Run again")}
                </Button>
              )}
            </div>
            {h.state !== "siap" && (
              <>
                <Meter value={h.counted} maxValue={Math.max(1, h.expected)} valueLabel={`${num(h.counted)}/${num(h.expected)}`} color={settled && !h.missing.length ? "success" : settled ? "danger" : "accent"}>
                  <Label>{tr("Sudah di titik kumpul", "At the muster point")}</Label>
                  <Meter.Output />
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
                {settled && !h.missing.length && <p className="text-sm text-success">{tr("Lengkap. Semua orang sudah di titik kumpul.", "Complete. Everyone reached the muster point.")}</p>}
                {settled && h.missing.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-danger">{tr(`${h.missing.length} orang belum sampai`, `${h.missing.length} people not there yet`)}</p>
                    <ul className="flex flex-col text-sm">
                      {h.missing.map((m) => (
                        <li key={m.orang.id} className="flex justify-between gap-3 px-2 py-1">
                          <span className="truncate">{m.orang.nama}</span>
                          <span className="shrink-0 text-muted">{tr(`terakhir di ${m.terakhir}`, `last seen at ${m.terakhir}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!settled && <p className="text-xs text-muted">{tr("Kamera titik kumpul sedang menghitung…", "The muster-point camera is counting…")}</p>}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * People per zone against capacity, how they move, and the evacuation headcount. Same one-screen
 * layout as the detection pages: three numbers, the spotlight camera, everything else in tabs.
 */
export function KepadatanPage() {
  "use no memo"
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getKepadatan(filters), key, REFRESH_MS)
  const d = query.data
  useDrills()
  const musters = headcounts(filters)
  const running = musters.find((h) => h.state !== "siap")
  const kamera = new Map(useMaster().kamera.map((k) => [k.id, k]))
  const [picked, setPicked] = useState<string | null>(null)
  const [bigOpen, setBigOpen] = useState(false)
  const [tab, setTab] = useState("zona")

  const cams = (d?.zones ?? []).flatMap((z) =>
    z.kamera.flatMap((id) => {
      const k = kamera.get(id)
      return k ? [{ id, zone: z, camera: toCamera(k), status: cameraStatusOf(id) }] : []
    }),
  )
  // The spotlight: what the user picked, else the fullest zone's camera.
  const focus = cams.find((c) => c.id === picked) ?? cams.find((c) => c.status.online) ?? cams[0]
  const over = d?.zones.filter((z) => z.count > z.kapasitas) ?? []

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:min-h-[34rem]">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["zona"]} />
      </div>

      <KpiGrid>
        <KpiCard compact icon={Users} label={tr("Orang di area sekarang", "People in the area now")} value={d ? num(d.total) : <Loading />} note={d ? tr(`di ${d.zones.length} zona yang dihitung`, `in ${d.zones.length} counted zones`) : undefined} />
        <KpiCard
          compact
          icon={TriangleAlert}
          label={tr("Zona lewat kapasitas", "Zones over capacity")}
          value={d ? num(over.length) : <Loading />}
          tone={over.length ? "danger" : "default"}
          note={over.length ? over.map((z) => z.label).join(", ") : d ? tr(`${d.lewat.length} kali lewat batas hari ini`, `${d.lewat.length} times over today`) : undefined}
        />
        <KpiCard
          compact
          icon={Megaphone}
          label={tr("Titik kumpul", "Muster point")}
          value={running ? `${num(running.counted)}/${num(running.expected)}` : tr("Siap", "Ready")}
          note={running ? (running.state === "berjalan" ? tr("Simulasi berjalan", "Drill running") : tr("Simulasi selesai", "Drill finished")) : tr(`${num(musters.reduce((a, h) => a + h.expected, 0))} orang tercatat di dalam`, `${num(musters.reduce((a, h) => a + h.expected, 0))} people recorded inside`)}
        />
      </KpiGrid>

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        <Card className="min-w-0 lg:min-h-0">
          <Card.Content className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
            <div className="relative aspect-video lg:aspect-auto lg:min-h-0 lg:flex-1">
              {!d ? (
                <Skeleton className="size-full rounded-lg" />
              ) : !focus ? (
                <p className="grid size-full place-items-center rounded-lg bg-default text-sm text-muted">{tr("Belum ada kamera hitung orang di lingkup ini.", "No people-counting camera in this scope yet.")}</p>
              ) : (
                <>
                  <CameraTile key={focus.id} camera={focus.camera} status={focus.status} fill onOpen={() => setBigOpen(true)} onDismissAlert={() => {}} />
                  <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-lg bg-black/65 px-2.5 py-1.5 text-sm text-white">
                    <Users className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{focus.zone.label}</span>
                    <span className="font-semibold tabular-nums">{tr(`${focus.zone.count} / ${focus.zone.kapasitas} orang`, `${focus.zone.count} / ${focus.zone.kapasitas} people`)}</span>
                  </div>
                </>
              )}
            </div>

            {cams.length > 1 && (
              <ul className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label={tr("Kamera lain", "Other cameras")}>
                {cams.map((c) => (
                  <li key={c.id} className="shrink-0">
                    <button type="button" onClick={() => setPicked(c.id)} aria-pressed={c.id === focus?.id} className={cn("flex w-32 flex-col gap-1 rounded-lg p-1 text-left hover:bg-default", c.id === focus?.id && "bg-default ring-2 ring-accent")}>
                      <span className="relative block aspect-video overflow-hidden rounded-md bg-black">
                        <StillFrame src={c.camera.streamUrl} offline={!c.status.online} />
                        <span className={cn("absolute top-1 right-1 rounded-full px-1.5 text-[11px] font-medium tabular-nums", c.zone.count > c.zone.kapasitas ? "bg-danger text-danger-foreground" : "bg-black/70 text-white")}>{c.zone.count}</span>
                      </span>
                      <span className="truncate px-0.5 text-xs">{c.camera.label.replace(`${c.id} · `, "")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
        </Card>

        <Card className="min-w-0 lg:min-h-0">
          <Card.Content className="flex flex-col lg:min-h-0 lg:flex-1">
            <Tabs className="flex flex-col lg:min-h-0 lg:flex-1" selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
              <Tabs.ListContainer>
                <Tabs.List aria-label={tr("Detail kepadatan", "Occupancy detail")}>
                  {[
                    ["zona", tr("Per zona", "Per zone")],
                    ["kumpul", tr("Titik kumpul", "Muster point")],
                    ["arus", tr("Arus orang", "People flow")],
                  ].map(([id, label]) => (
                    <Tabs.Tab key={id} id={id} className="whitespace-nowrap">
                      {label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="zona" className="max-h-[28rem] overflow-y-auto pt-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                <ZonesTab query={query} onPick={setPicked} />
              </Tabs.Panel>
              <Tabs.Panel id="kumpul" className="max-h-[28rem] overflow-y-auto pt-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                <MusterTab />
              </Tabs.Panel>
              <Tabs.Panel id="arus" className="max-h-[28rem] overflow-y-auto pt-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                <FlowTab query={query} />
              </Tabs.Panel>
            </Tabs>
          </Card.Content>
        </Card>
      </div>

      <CameraDetail camera={focus?.camera} status={focus?.status} isOpen={bigOpen} onOpenChange={setBigOpen} />
    </div>
  )
}
