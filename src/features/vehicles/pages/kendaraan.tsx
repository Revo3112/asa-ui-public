import { useState } from "react"
import { Chip, Skeleton, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { Car, Fuel } from "lucide-react"
import { ReferenceLine } from "recharts"

import { EvilBarChart } from "@/shared/charts/evilcharts/charts/recharts-bar-chart"
import { DetectionView } from "@/features/detection/components/detection-view"
import { ANTRIAN_MAKS, getAntrian, getPlat, platStatusMeta, TUNGGU_MAKS } from "@/features/vehicles/data/kendaraan"
import { useFilters } from "@/shared/components/filter-bar"
import { KpiCard } from "@/shared/components/kpi-card"
import { REFRESH_MS, useWidgetData, WidgetBody } from "@/shared/components/widget"
import { locale, tr } from "@/shared/lib/i18n"

const num = (n: number) => n.toLocaleString(locale())
const clock = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
const when = (d: Date) => (new Date().toDateString() === d.toDateString() ? clock(d) : d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))

function Loading() {
  return <Skeleton render={(p) => <span {...p} />} className="inline-block h-7 w-14 rounded-md align-middle" />
}

function usePlat() {
  const { filters, key } = useFilters()
  return useWidgetData(() => getPlat(filters), key)
}

function useAntrian() {
  const { filters, key } = useFilters()
  return useWidgetData(() => getAntrian(filters), key, REFRESH_MS)
}

/** A plate as it reads on the vehicle. */
const Plate = ({ children }: { children: string }) => <span className="shrink-0 rounded-md bg-foreground px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-background">{children}</span>

function PassesKpi() {
  const d = usePlat().data
  return <KpiCard compact icon={Car} label={tr("Kendaraan lewat", "Vehicles passed")} value={d ? num(d.rows.length) : <Loading />} note={d ? tr(`${num(d.masuk)} masuk · ${num(d.keluar)} keluar`, `${num(d.masuk)} in · ${num(d.keluar)} out`) : undefined} />
}

function QueueKpi() {
  const d = useAntrian().data
  const top = d && [...d.bays].sort((a, b) => b.panjang - a.panjang)[0]
  return (
    <KpiCard
      compact
      icon={Fuel}
      label={tr("Antrian BBM sekarang", "Fuel queue now")}
      value={!d ? <Loading /> : top ? tr(`${top.panjang} kendaraan`, `${top.panjang} vehicles`) : "–"}
      tone={d?.bays.some((b) => b.lewat) ? "warning" : "default"}
      note={top ? tr(`Tunggu terlama ${top.tungguMaks} menit`, `Longest wait ${top.tungguMaks} min`) : d ? tr("Tidak ada kamera antrian di lingkup ini", "No queue camera in this scope") : undefined}
    />
  )
}

/** Every plate read, newest first; the ones not on the list are flagged. */
function PlateLog() {
  const query = usePlat()
  const [only, setOnly] = useState<"semua" | "tak-terdaftar">("semua")
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-48 rounded-lg" />} isEmpty={(d) => !d.rows.length} empty={tr("Belum ada plat terbaca.", "No plates read yet.")}>
      {(d) => {
        const rows = (only === "semua" ? d.rows : d.rows.filter((r) => r.status !== "terdaftar")).slice(0, 60)
        return (
          <div className="flex flex-col gap-2">
            <ToggleButtonGroup aria-label={tr("Tampilkan", "Show")} size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[only]} onSelectionChange={(k) => setOnly([...k][0] as typeof only)} className="self-start">
              <ToggleButton id="semua">{tr("Semua", "All")}</ToggleButton>
              <ToggleButton id="tak-terdaftar">
                <ToggleButtonGroup.Separator />
                {tr(`Tak terdaftar (${num(d.tidakTerdaftar)})`, `Unregistered (${num(d.tidakTerdaftar)})`)}
              </ToggleButton>
            </ToggleButtonGroup>
            <ol className="flex flex-col">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <span className="w-12 shrink-0 text-xs text-muted tabular-nums">{when(r.waktu)}</span>
                  <Plate>{r.plat}</Plate>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {r.jenis} · {r.zona.label} · {r.arah === "masuk" ? tr("Masuk", "In") : tr("Keluar", "Out")}
                  </span>
                  {r.status !== "terdaftar" && (
                    <Chip size="sm" variant="soft" color={platStatusMeta[r.status].color}>
                      {platStatusMeta[r.status].label}
                    </Chip>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )
      }}
    </WidgetBody>
  )
}

const queueConfig = { panjang: { get label() { return tr("Antrian terpanjang", "Longest queue") }, colors: { light: ["var(--chart-2)"], dark: ["var(--chart-2)"] } } }

/** The fuel bays now (who waits and how long), and how the queue went today. */
function QueueTab() {
  const query = useAntrian()
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-56 rounded-lg" />} isEmpty={(d) => !d.bays.length} empty={tr("Belum ada kamera antrian di lingkup ini.", "No queue camera in this scope yet.")}>
      {(d) => (
        <div className="flex flex-col gap-4">
          {d.bays.map((b) => (
            <section key={`${b.site}/${b.zona}`} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-medium">{b.label}</p>
                <p className="text-sm">
                  <span className={b.lewat ? "font-semibold text-warning-ink" : "font-semibold"}>{tr(`${b.panjang} kendaraan`, `${b.panjang} vehicles`)}</span>
                  <span className="text-muted"> · {tr(`tunggu terlama ${b.tungguMaks} mnt, rata-rata ${b.tungguRata} mnt`, `longest wait ${b.tungguMaks} min, average ${b.tungguRata} min`)}</span>
                </p>
              </div>
              {b.lewat && <p className="text-xs text-warning-ink">{tr(`Lewat batas (${ANTRIAN_MAKS} kendaraan atau ${TUNGGU_MAKS} menit). Buka jalur pengisian kedua atau atur ulang jadwal isi.`, `Over the limit (${ANTRIAN_MAKS} vehicles or ${TUNGGU_MAKS} minutes). Open a second fuelling lane or reschedule refuelling.`)}</p>}
              {b.kendaraan.length > 0 && (
                <ol className="flex flex-wrap gap-2">
                  {b.kendaraan.map((v, i) => (
                    <li key={i} className="flex items-center gap-1.5 rounded-lg bg-default px-2 py-1 text-xs">
                      <Plate>{v.plat}</Plate>
                      <span className="text-muted tabular-nums">{tr(`${v.menit} mnt`, `${v.menit} min`)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
          <section className="flex min-h-48 flex-1 flex-col gap-1">
            <p className="text-sm text-muted">{tr("Antrian terpanjang per jam, hari ini", "Longest queue per hour, today")}</p>
            <EvilBarChart data={d.series} config={queueConfig} className="aspect-auto h-full min-h-44">
              <EvilBarChart.Grid />
              <EvilBarChart.XAxis dataKey="jam" />
              <EvilBarChart.YAxis allowDecimals={false} />
              <EvilBarChart.Tooltip />
              <ReferenceLine y={ANTRIAN_MAKS} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: tr(`Batas ${ANTRIAN_MAKS}`, `Limit ${ANTRIAN_MAKS}`), position: "insideTopLeft", fill: "var(--warning-ink, var(--warning))", fontSize: 11 }} />
              <EvilBarChart.Bar dataKey="panjang" />
            </EvilBarChart>
          </section>
        </div>
      )}
    </WidgetBody>
  )
}

/** Plates at the gates and the fuel-bay queue. */
export function KendaraanPage() {
  const { key } = useFilters()
  return (
    <DetectionView
      key={key}
      kategori="kendaraan-tak-terdaftar"
      firstKpi={<PassesKpi />}
      secondKpi={<QueueKpi />}
      tabs={[
        { id: "plat", label: tr("Log plat", "Plate log"), content: <PlateLog /> },
        { id: "antrian", label: tr("Antrian BBM", "Fuel queue"), content: <QueueTab /> },
      ]}
    />
  )
}
