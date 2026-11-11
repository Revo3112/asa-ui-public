import { useState } from "react"
import { Button, Chip, Skeleton, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { Route, ScanFace, UserX } from "lucide-react"

import { getAkses, jejakOf, peranLabel, type FaceRecord } from "@/features/access/data/akses"
import { DetectionView } from "@/features/detection/components/detection-view"
import { useFilters } from "@/shared/components/filter-bar"
import { KpiCard } from "@/shared/components/kpi-card"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import { locale, tr } from "@/shared/lib/i18n"

const num = (n: number) => n.toLocaleString(locale())
const clock = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
const when = (d: Date) => (new Date().toDateString() === d.toDateString() ? clock(d) : d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))

function Loading() {
  return <Skeleton render={(p) => <span {...p} />} className="inline-block h-7 w-14 rounded-md align-middle" />
}

function useAkses() {
  const { filters, key } = useFilters()
  return useWidgetData(() => getAkses(filters), key)
}

function FacesKpi() {
  const d = useAkses().data
  return <KpiCard compact icon={ScanFace} label={tr("Wajah terdeteksi", "Faces detected")} value={d ? num(d.rows.length) : <Loading />} note={d ? tr(`${num(d.orang)} orang dikenal · ${num(d.tamu)} tamu`, `${num(d.orang)} known people · ${num(d.tamu)} visitors`) : undefined} />
}

function UnknownKpi() {
  const d = useAkses().data
  return <KpiCard compact icon={UserX} label={tr("Tak dikenal", "Unknown")} value={d ? num(d.takDikenal) : <Loading />} tone={d?.takDikenal ? "warning" : "default"} note={tr("Masuk Indikasi AI untuk direview", "Sent to AI Indications for review")} />
}

const arahLabel = (r: FaceRecord) => (r.arah === "masuk" ? tr("Masuk", "In") : tr("Keluar", "Out"))

/** Every face the gate cameras matched, newest first. A row opens that person's trail. */
function FaceLog({ onTrail }: { onTrail: (id: string) => void }) {
  const query = useAkses()
  const [only, setOnly] = useState<"semua" | "tak-dikenal">("semua")
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-48 rounded-lg" />} isEmpty={(d) => !d.rows.length} empty={tr("Belum ada wajah terdeteksi.", "No faces detected yet.")}>
      {(d) => {
        const rows = (only === "semua" ? d.rows : d.rows.filter((r) => !r.orang)).slice(0, 60)
        return (
          <div className="flex flex-col gap-2">
            <ToggleButtonGroup aria-label={tr("Tampilkan", "Show")} size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[only]} onSelectionChange={(k) => setOnly([...k][0] as typeof only)} className="self-start">
              <ToggleButton id="semua">{tr("Semua", "All")}</ToggleButton>
              <ToggleButton id="tak-dikenal">
                <ToggleButtonGroup.Separator />
                {tr("Tak dikenal", "Unknown")}
              </ToggleButton>
            </ToggleButtonGroup>
            <ol className="flex flex-col">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onTrail(r.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-default">
                    <span className="w-12 shrink-0 text-xs text-muted tabular-nums">{when(r.waktu)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.orang ? r.orang.nama : tr("Tak dikenal", "Unknown")}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.orang ? peranLabel[r.orang.peran] : r.indikasiId} · {r.zona.label} · {arahLabel(r)}
                      </span>
                    </span>
                    {!r.orang && (
                      <Chip size="sm" color="warning" variant="soft">
                        {tr("Perlu review", "Needs review")}
                      </Chip>
                    )}
                    <Route className="size-4 shrink-0 text-muted" aria-label={tr("Lihat jejak", "View trail")} />
                  </button>
                </li>
              ))}
            </ol>
            {only === "semua" && d.rows.length > 60 && <p className="px-2 text-xs text-muted">{tr(`Menampilkan 60 terbaru dari ${num(d.rows.length)}.`, `Showing the latest 60 of ${num(d.rows.length)}.`)}</p>}
          </div>
        )
      }}
    </WidgetBody>
  )
}

const stopLabel = { masuk: () => tr("Masuk gerbang", "Entered at the gate"), terlihat: () => tr("Terlihat", "Seen"), keluar: () => tr("Keluar gerbang", "Left at the gate"), terakhir: () => tr("Terakhir terlihat", "Last seen") }

/** Where one person went after the gate. Defaults to the newest unknown face, the one security wants first. */
function Trail({ id, onBack }: { id?: string; onBack: () => void }) {
  const { filters } = useFilters()
  const query = useAkses()
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-48 rounded-lg" />} isEmpty={(d) => !d.rows.length} empty={tr("Belum ada wajah terdeteksi.", "No faces detected yet.")}>
      {(d) => {
        const pick = id ?? (d.rows.find((r) => !r.orang) ?? d.rows[0])?.id
        const j = pick ? jejakOf(filters, pick) : undefined
        if (!j) return <p className="text-sm text-muted">{tr("Pilih orang di Log wajah.", "Pick someone in the face log.")}</p>
        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{j.label}</p>
                <p className="text-xs text-muted">{j.peran ? peranLabel[j.peran] : tr("Wajah tidak cocok dengan data terdaftar", "Face matched no registered person")}</p>
              </div>
              <Button size="sm" variant="tertiary" onPress={onBack}>
                {tr("Pilih orang lain", "Pick someone else")}
              </Button>
            </div>
            <ol className="flex flex-col gap-3 border-l border-border pl-4 text-sm">
              {j.stops.map((s, i) => (
                <li key={i}>
                  <p className={s.jenis === "terakhir" ? "font-medium" : undefined}>
                    {stopLabel[s.jenis]()} · {s.zona}
                  </p>
                  <p className="text-xs text-muted tabular-nums">
                    {when(s.waktu)} · {s.kamera}
                  </p>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted">{tr("Jejak dari kamera hitung orang yang mengenali orang yang sama (re-identifikasi), bukan GPS.", "Trail from the counting cameras that recognised the same person (re-identification), not GPS.")}</p>
          </div>
        )
      }}
    </WidgetBody>
  )
}

/** Faces at the gates: who came in, who nobody knows, and where they went. */
export function AksesPage() {
  const { key } = useFilters()
  const [tab, setTab] = useState("terbaru")
  const [trail, setTrail] = useState<string>()
  return (
    <DetectionView
      key={key}
      kategori="orang-tak-dikenal"
      firstKpi={<FacesKpi />}
      secondKpi={<UnknownKpi />}
      tab={tab}
      onTabChange={setTab}
      tabs={[
        {
          id: "log",
          label: tr("Log wajah", "Face log"),
          content: (
            <FaceLog
              onTrail={(id) => {
                setTrail(id)
                setTab("jejak")
              }}
            />
          ),
        },
        { id: "jejak", label: tr("Jejak", "Trail"), content: <Trail id={trail} onBack={() => setTab("log")} /> },
      ]}
    />
  )
}
