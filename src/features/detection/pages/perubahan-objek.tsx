import { Chip, Skeleton } from "@heroui/react"

import { DetectionView } from "@/features/detection/components/detection-view"
import { getUseCase } from "@/features/detection/data/use-case"
import { useFilters } from "@/shared/components/filter-bar"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import { isAreaActive } from "@/shared/config/area-terlarang"
import { pendingReview } from "@/shared/config/indikasi"
import { useMaster } from "@/shared/data/master"
import { locale, tr } from "@/shared/lib/i18n"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"

const clock = (d: Date) => d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** Which reference area of the camera an indication is about. ponytail: the edge sends the area id. */
const areaIndex = (id: string, n: number) => {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % n
}

/**
 * Every watched stack and rack: still as in its reference image, or changed with an indication
 * waiting for review. A change that was reviewed is back to "matches" once the reference is updated.
 */
function ReferenceTab() {
  const { filters, key } = useFilters()
  const version = useWorkflowVersion()
  const query = useWidgetData(() => getUseCase(filters, "perubahan-objek"), key, undefined, version)
  const kamera = useMaster().kamera
  return (
    <WidgetBody query={query} skeleton={<Skeleton className="h-48 rounded-lg" />} isEmpty={(d) => !d.cameras.length} empty={tr("Belum ada kamera yang menjalankan deteksi ini.", "No camera runs this detection yet.")}>
      {(d) => (
        <div className="flex flex-col gap-4">
          {d.cameras.map((c) => {
            const k = kamera.find((x) => x.id === c.id)
            const areas = k?.acuan?.areas ?? []
            const open = d.rows.filter((e) => e.kamera === c.id && pendingReview.includes(e.workflow))
            return (
              <section key={c.id} className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">
                  {c.nama} <span className="font-normal text-muted">· {c.id}</span>
                </p>
                <ul className="flex flex-col">
                  {areas.map((a, i) => {
                    const change = open.find((e) => areaIndex(e.id, areas.length) === i)
                    const on = isAreaActive(a)
                    return (
                      <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{a.nama}</span>
                          <span className="block truncate text-xs text-muted">
                            {change ? `${change.judul} · ${clock(change.waktu)}` : a.jam ? tr(`Diperiksa ${a.jam.mulai}–${a.jam.selesai}`, `Checked ${a.jam.mulai}–${a.jam.selesai}`) : tr("Diperiksa sepanjang waktu", "Checked at all times")}
                          </span>
                        </span>
                        {change ? (
                          <Chip size="sm" variant="soft" color="warning">
                            {tr("Berubah", "Changed")}
                          </Chip>
                        ) : (
                          <Chip size="sm" variant="soft">
                            {on ? tr("Sesuai acuan", "Matches") : tr("Tidak diperiksa", "Not checked")}
                          </Chip>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </WidgetBody>
  )
}

/** Stacks and racks compared with their reference image: what fell, shifted or went missing. */
export function PerubahanObjekPage() {
  const { key } = useFilters()
  return <DetectionView key={key} kategori="perubahan-objek" tabs={[{ id: "acuan", label: tr("Acuan", "Reference"), content: <ReferenceTab /> }]} />
}
