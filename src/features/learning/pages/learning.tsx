import { useEffect, useRef, useState } from "react"
import { Alert, Button, Chip, Description, Label, Skeleton, Switch, toast } from "@heroui/react"
import { BrainCircuit, CheckCheck, Database, FlaskConical, Rocket, Tags, Upload, type LucideIcon } from "lucide-react"

import { FilterBar, useFilters } from "@/shared/components/filter-bar"
import { IconTile, MiniBar } from "@/shared/components/visual"
import { REFRESH_MS, useWidgetData, Widget, WidgetBody } from "@/shared/components/widget"
import { OptionSelect } from "@/shared/components/workflow-forms"
import { kategoriDef, kategoriDefs, outcomeMeta, type Kategori } from "@/shared/config/indikasi"
import { getModelRows, isContinuous, mockDetect, setContinuous, type LabelCounts, type TestBox } from "@/features/learning/data/learning"
import { useRole } from "@/shared/auth/session"
import { locale, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"

const steps: { icon: LucideIcon; title: () => string; text: () => string }[] = [
  { icon: CheckCheck, title: () => tr("Review temuan", "Finding review"), text: () => tr("Petugas memutuskan tiap indikasi di alur review.", "Reviewers decide each indication in the review flow.") },
  { icon: Tags, title: () => tr("Jadi label", "Becomes a label"), text: () => tr("Terkonfirmasi, bukan pelanggaran, dan alarm palsu jadi sampel berlabel.", "Confirmed, no-violation and false-alarm become labelled samples.") },
  { icon: Database, title: () => tr("Dataset", "Dataset"), text: () => tr("Klip dan thumbnail disimpan per detektor dan site.", "Clips and thumbnails are stored per detector and site.") },
  { icon: FlaskConical, title: () => tr("Latih & validasi", "Train & validate"), text: () => tr("Model baru diuji pada data yang belum pernah dilihat.", "The new model is tested on data it has not seen.") },
  { icon: Rocket, title: () => tr("Rilis ke edge", "Release to edge"), text: () => tr("Hanya setelah disetujui HSE dan IT/OT.", "Only after HSE and IT/OT sign off.") },
]

const labelTone: Record<keyof LabelCounts, string> = { confirmed: "bg-danger", noViolation: "bg-success", falseAlarm: "bg-muted", inconclusive: "bg-warning" }
const labelName: Record<keyof LabelCounts, () => string> = {
  confirmed: () => outcomeMeta.confirmed.label,
  noViolation: () => outcomeMeta["no-violation"].label,
  falseAlarm: () => outcomeMeta["false-alarm"].label,
  inconclusive: () => outcomeMeta.inconclusive.label,
}

function LabelBar({ labels }: { labels: LabelCounts }) {
  const keys = Object.keys(labels) as (keyof LabelCounts)[]
  const total = keys.reduce((n, k) => n + labels[k], 0)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-default" aria-hidden>
        {total > 0 && keys.map((k) => <div key={k} className={labelTone[k]} style={{ width: `${(labels[k] / total) * 100}%` }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-1">
            <span className={cn("size-2 rounded-full", labelTone[k])} aria-hidden />
            {labelName[k]()} <span className="text-foreground tabular-nums">{labels[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ModelsWidget() {
  const { filters, key } = useFilters()
  const version = useWorkflowVersion()
  const query = useWidgetData(() => getModelRows(filters), key, REFRESH_MS, version)
  const role = useRole()
  const canEdit = role === "super-admin" || role === "it-ot"
  const [, setTick] = useState(0)

  return (
    <Widget
      title={tr("Model per detektor", "Models by detector")}
      description={tr("Sampel berlabel dihitung dari review yang selesai dalam 30 hari, di cakupan filter. Hasil “tidak dapat dipastikan” tidak dipakai untuk training.", "Labelled samples are counted from reviews completed in the last 30 days, in the filter scope. Inconclusive reviews are not used for training.")}
      subtitle={canEdit ? undefined : tr("Hanya Super Admin dan IT/OT yang bisa mengubah pengaturan learning.", "Only Super Admin and IT/OT can change learning settings.")}
    >
      <WidgetBody
        query={query}
        skeleton={
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => !rows.length}
        empty={tr("Belum ada detektor.", "No detectors yet.")}
      >
        {(rows) => (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((m) => {
              const ready = m.usable >= m.threshold
              const on = isContinuous(m.kategori)
              return (
                <li key={m.kategori} className="flex flex-col gap-3 rounded-xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <IconTile icon={BrainCircuit} tone={ready ? "accent" : "default"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.label}</p>
                      <p className="text-xs text-muted">
                        {m.version} · {tr("dilatih", "trained")} {m.trainedAt.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <Chip size="sm" color={ready ? "accent" : "default"}>
                      {ready ? tr("Siap dilatih ulang", "Ready to retrain") : tr("Mengumpulkan sampel", "Collecting samples")}
                    </Chip>
                  </div>
                  <LabelBar labels={m.labels} />
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="flex justify-between text-muted">
                      <span>{tr("Sampel siap pakai", "Usable samples")}</span>
                      <span className="text-foreground tabular-nums">
                        {m.usable}/{m.threshold}
                      </span>
                    </span>
                    <MiniBar value={m.usable} max={m.threshold} tone={ready ? "accent" : "default"} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <Switch
                      isSelected={on}
                      isDisabled={!canEdit}
                      onChange={(v) => {
                        setContinuous(m.kategori, v)
                        setTick((n) => n + 1)
                        toast.success(v ? tr(`Continuous learning ${m.label} aktif (simulasi).`, `Continuous learning for ${m.label} is on (simulated).`) : tr(`Continuous learning ${m.label} dimatikan.`, `Continuous learning for ${m.label} is off.`))
                      }}
                    >
                      <Switch.Content className="flex-row items-center gap-2">
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                        <Label className="text-sm">Continuous learning</Label>
                      </Switch.Content>
                    </Switch>
                    <Button size="sm" variant="secondary" isDisabled={!canEdit || !ready} onPress={() => toast.success(tr(`Training ${m.version} masuk antrean. Hasilnya perlu divalidasi sebelum dirilis (simulasi).`, `Training for ${m.version} queued. The result needs validation before release (simulated).`))}>
                      {tr("Latih ulang", "Retrain")}
                    </Button>
                  </div>
                  {on && <Description>{tr(`Sampel baru otomatis masuk dataset. Training berjalan sendiri tiap ${m.threshold} sampel; rilis tetap menunggu persetujuan.`, `New samples join the dataset automatically. Training runs every ${m.threshold} samples; release still waits for sign-off.`)}</Description>}
                </li>
              )
            })}
          </ul>
        )}
      </WidgetBody>
    </Widget>
  )
}

/** Try a model on a local image or video. The file never leaves the browser; the result is made up. */
function ModelTestWidget() {
  const [kategori, setKategori] = useState<Kategori>("apd")
  const [file, setFile] = useState<{ name: string; size: number; url: string; video: boolean } | null>(null)
  const [result, setResult] = useState<{ key: string; boxes: TestBox[] } | null>(null)
  const [running, setRunning] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const runKey = file ? `${file.url}|${kategori}` : ""
  const boxes = result?.key === runKey ? result.boxes : null

  useEffect(() => () => void (file && URL.revokeObjectURL(file.url)), [file])

  const run = async () => {
    if (!file) return
    setRunning(true)
    const label = kategoriDef(kategori).label
    const found = await mockDetect(file, kategori, label)
    setResult({ key: runKey, boxes: found })
    setRunning(false)
  }

  return (
    <Widget
      title={tr("Uji model", "Test a model")}
      description={tr("Unggah gambar atau video untuk melihat apa yang dideteksi model. Berkas tidak dikirim ke mana pun; di pratinjau ini hasilnya simulasi.", "Upload an image or video to see what the model detects. The file goes nowhere; in this preview the result is simulated.")}
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <OptionSelect label={tr("Model", "Model")} value={kategori} options={kategoriDefs.map((k) => ({ id: k.id, label: k.label }))} onChange={(v) => setKategori(v as Kategori)} />
          <div className="flex gap-2">
            <input
              ref={input}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              aria-label={tr("Pilih gambar atau video", "Pick an image or video")}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setFile({ name: f.name, size: f.size, url: URL.createObjectURL(f), video: f.type.startsWith("video/") })
                e.target.value = ""
              }}
            />
            <Button variant="secondary" onPress={() => input.current?.click()}>
              <Upload aria-hidden />
              {file ? tr("Ganti berkas", "Change file") : tr("Pilih berkas", "Pick a file")}
            </Button>
            <Button isDisabled={!file || running} onPress={run}>
              {running ? tr("Mendeteksi…", "Detecting…") : tr("Jalankan", "Run")}
            </Button>
          </div>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-lg bg-default">
          {file ? (
            file.video ? (
              <video src={file.url} controls muted playsInline className="size-full object-contain" aria-label={file.name} />
            ) : (
              <img src={file.url} alt={file.name} className="size-full object-contain" />
            )
          ) : (
            <button type="button" onClick={() => input.current?.click()} className="grid size-full place-items-center text-sm text-muted hover:bg-default-hover">
              <span className="flex flex-col items-center gap-2">
                <Upload className="size-6" aria-hidden />
                {tr("Pilih gambar atau video dari perangkat", "Pick an image or video from your device")}
              </span>
            </button>
          )}
          {boxes?.map((b, i) => (
            <div key={i} className="pointer-events-none absolute border-2 border-danger" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }} aria-hidden>
              <span className="absolute -top-px left-0 -translate-y-full bg-danger px-1 py-px text-[10px] whitespace-nowrap text-danger-foreground">
                {b.score.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {boxes && (
          <div role="status" className="flex flex-col gap-1 text-sm">
            <p>
              {boxes.length
                ? tr(`${boxes.length} deteksi “${kategoriDef(kategori).label}”.`, `${boxes.length} “${kategoriDef(kategori).label}” detections.`)
                : tr(`Tidak ada deteksi “${kategoriDef(kategori).label}”.`, `No “${kategoriDef(kategori).label}” detections.`)}{" "}
              {boxes.length > 0 && tr(`Skor: ${boxes.map((b) => b.score.toFixed(2)).join(", ")} (skor model, bukan akurasi).`, `Scores: ${boxes.map((b) => b.score.toFixed(2)).join(", ")} (model score, not accuracy).`)}
            </p>
            <p className="text-xs text-muted">{tr("Hasil simulasi. Model belum tersambung di pratinjau ini.", "Simulated result. The model is not connected in this preview.")}</p>
          </div>
        )}
      </div>
    </Widget>
  )
}

export function LearningPage() {
  return (
    <div className="flex flex-col gap-4">
      <FilterBar base={["site", "zona"]} />
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{tr("Pratinjau V2", "V2 preview")}</Alert.Title>
          <Alert.Description>{tr("Gambaran menu Learning: hasil review jadi data latih model di edge. Jumlah label dihitung dari data review; versi model, training, dan uji model masih simulasi.", "A look at the Learning menu: review results become training data for the edge models. Label counts come from the review data; model versions, training and the model test are simulated.")}</Alert.Description>
        </Alert.Content>
      </Alert>

      <Widget title={tr("Alur continuous learning", "Continuous learning flow")} description={tr("Model tidak pernah berubah sendiri di lapangan: setiap rilis lewat validasi dan persetujuan.", "A model never changes by itself in the field: every release goes through validation and sign-off.")}>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5 rounded-xl bg-default/50 p-3">
              <IconTile icon={s.icon} tone={i === steps.length - 1 ? "warning" : "accent"} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {i + 1}. {s.title()}
                </p>
                <p className="text-xs text-muted">{s.text()}</p>
              </div>
            </li>
          ))}
        </ol>
      </Widget>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ModelsWidget />
        <ModelTestWidget />
      </div>
    </div>
  )
}
