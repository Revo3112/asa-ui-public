import { useState } from "react"
import { Button, buttonVariants, Card, Chip, Drawer, Dropdown, Label, Skeleton, ToggleButton, ToggleButtonGroup, toast } from "@heroui/react"
import { CircleCheck, Copy, Download, Ellipsis, ListChecks } from "lucide-react"
import { Link, useNavigate } from "react-router"

import { FilterButton, useFilters } from "@/shared/components/filter-bar"
import { CompareBars, IconTile, MiniBar, OwnerBadge, type Tone } from "@/shared/components/visual"
import { InfoTip, REFRESH_MS, useWidgetData, WidgetBody } from "@/shared/components/widget"
import { NewActionForm, OptionSelect } from "@/shared/components/workflow-forms"
import { actionOwners, createAction } from "@/features/cases/data/kasus"
import { areaLabel, getRecommendations, priorityLabel, recommendationsMarkdown, type RecArea, type RecPriority, type Rekomendasi } from "@/features/recommendations/data/rekomendasi"
import { siteOptions } from "@/shared/data/scope"
import { fillLastRow } from "@/shared/lib/grid"
import { locale, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"
import { dueDate, runWorkflow, useWorkflowVersion } from "@/shared/lib/workflow-ui"

const priorityTone: Record<RecPriority, Tone> = { tinggi: "danger", sedang: "warning", rendah: "default" }

/** Actions made from a recommendation in this session, so the card shows the action instead of offering a second one. */
const made = new Map<string, { id: string; site: string }>()

const weekRange = () => {
  const fmt = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" })
  const end = new Date()
  const start = new Date(end.getTime() - 6 * 86_400_000)
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

function RecCard({ rec, rank, featured, onAct, action }: { rec: Rekomendasi; rank: number; featured?: boolean; onAct: () => void; action?: { id: string; site: string } }) {
  const navigate = useNavigate()
  const tone = priorityTone[rec.priority]
  const bar = rec.metric.bar
  const at = bar?.marker !== undefined && bar.max > 0 ? Math.min(100, (bar.marker / bar.max) * 100) : undefined
  return (
    <Card className="min-w-0">
      <Card.Header className="gap-2">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className={cn("tabular-nums", featured ? "font-semibold text-foreground" : "font-medium")} aria-label={tr(`Urutan ${rank}`, `Rank ${rank}`)}>
            #{rank}
          </span>
          <span aria-hidden>·</span>
          <span>{priorityLabel[rec.priority]}</span>
          <span aria-hidden>·</span>
          <span>{areaLabel[rec.area]}</span>
          <InfoTip label={rec.title}>{rec.why}</InfoTip>
        </div>
        <Card.Title render={(props) => <h3 {...props} />} className="text-lg leading-snug font-semibold">
          {rec.title}
        </Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-1 flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-xl font-medium tabular-nums">{rec.metric.value}</span>
            <span className="text-sm text-muted">{rec.metric.label}</span>
          </p>
          {bar && (
            <div>
              <MiniBar value={bar.value} max={bar.max} marker={bar.marker} tone={tone === "default" ? "accent" : tone} />
              {at !== undefined && bar.markerLabel && (
                <div className="relative h-4">
                  {/* Under its tick, kept inside the card near either end. */}
                  <span className={cn("absolute top-1 text-xs whitespace-nowrap text-muted tabular-nums", at < 15 ? "" : at > 85 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${at}%` }}>
                    {bar.markerLabel}
                  </span>
                </div>
              )}
            </div>
          )}
          {rec.metric.compare && <CompareBars {...rec.metric.compare} tone={tone === "default" ? "accent" : tone} />}
        </div>
        {/* Steps on the top three only; the rest open from their link. */}
        {featured && (
        <ol className="flex flex-col gap-2 rounded-xl bg-default/60 p-3">
          {rec.steps.map((s, i) => (
            <li key={s} className="flex gap-2 text-sm">
              <span className="w-4 shrink-0 text-muted tabular-nums" aria-hidden>
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <OwnerBadge name={rec.owner} />
          <div className="flex items-center gap-2">
            <Dropdown>
              <Button isIconOnly size="sm" variant="tertiary" aria-label={tr("Opsi lain", "More options")}>
                <Ellipsis aria-hidden />
              </Button>
              <Dropdown.Popover placement="bottom end" className="min-w-48">
                <Dropdown.Menu onAction={() => navigate(rec.link.href)}>
                  <Dropdown.Item id="link" textValue={rec.link.label}>
                    <Label>{rec.link.label}</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            {action ? (
              <Link to={`/tindakan?${new URLSearchParams({ site: action.site, id: action.id })}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
                <CircleCheck aria-hidden className="text-success" />
                {action.id}
              </Link>
            ) : (
              <Button size="sm" onPress={onAct}>
                {tr("Jadikan tindakan", "Make it an action")}
              </Button>
            )}
          </div>
        </div>
      </Card.Content>
    </Card>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

/** The drawer that turns one recommendation into a corrective action, prefilled from its steps. */
function ActionDrawer({ rec, site: scopeSite, onClose, onMade }: { rec?: Rekomendasi; site: string; onClose: () => void; onMade: (rec: Rekomendasi, a: { id: string; site: string }) => void }) {
  const fixed = rec?.site ?? (scopeSite !== "all" ? scopeSite : undefined)
  const [picked, setPicked] = useState("")
  const site = fixed ?? picked
  return (
    <Drawer.Backdrop isOpen={!!rec} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>{tr("Jadikan tindakan korektif", "Make it a corrective action")}</Drawer.Heading>
            <p className="text-sm text-muted">{tr("Judul dan catatan diisi dari rekomendasi. Ubah seperlunya, lalu pilih PIC dan tenggat.", "The title and note come from the recommendation. Edit as needed, then pick an owner and due date.")}</p>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-3">
            {rec && !fixed && <OptionSelect label="Site" value={picked} onChange={setPicked} options={siteOptions().filter((o) => o.id !== "all")} isRequired />}
            {rec && site && (
              <NewActionForm
                key={`${rec.id}|${site}`}
                initial={{ judul: rec.title, due: "7", catatanAwal: [rec.why, ...rec.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n") }}
                owners={actionOwners(site).map((u) => ({ id: u.id, label: u.nama }))}
                onCancel={onClose}
                onSubmit={async (d) => {
                  const a = await runWorkflow(() => createAction({ judul: d.judul, ownerId: d.ownerId, tenggat: dueDate(d.due), catatanAwal: d.catatanAwal, site, zona: rec.zona, sumber: tr("Rekomendasi minggu ini", "This week's recommendations") }), tr("Tindakan ditugaskan.", "Action assigned."))
                  if (a) onMade(rec, { id: a.id, site: a.site })
                }}
              />
            )}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

function Recommendations() {
  const { filters, key } = useFilters()
  const version = useWorkflowVersion()
  const query = useWidgetData(() => getRecommendations(filters), key, REFRESH_MS, version)
  const [area, setArea] = useState<RecArea | "all">("all")
  const [acting, setActing] = useState<Rekomendasi>()
  const [, bump] = useState(0)

  return (
    <WidgetBody
      query={query}
      skeleton={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-96 rounded-2xl" />
            ))}
          </div>
        </div>
      }
      isEmpty={(list) => !list.length}
      empty={tr("Tidak ada rekomendasi minggu ini: tidak ada zona, kategori, respons, atau perangkat yang melewati ambang.", "No recommendations this week: no zone, category, response or device crossed a threshold.")}
    >
      {(list) => {
        const heading = tr(`Rekomendasi minggu ini · ${weekRange()}`, `This week's recommendations · ${weekRange()}`)
        const counts = list.reduce((m, r) => m.set(r.area, (m.get(r.area) ?? 0) + 1), new Map<RecArea, number>())
        const high = list.filter((r) => r.priority === "tinggi").length
        const done = list.filter((r) => made.has(r.id)).length
        const shown = area === "all" ? list : list.filter((r) => r.area === area)
        const featured = area === "all" ? shown.slice(0, 3) : []
        const rest = area === "all" ? shown.slice(3) : shown
        const rankOf = (r: Rekomendasi) => list.indexOf(r) + 1
        const card = (r: Rekomendasi, isFeatured?: boolean) => <RecCard key={r.id} rec={r} rank={rankOf(r)} featured={isFeatured} action={made.get(r.id)} onAct={() => setActing(r)} />
        return (
          <div className="flex flex-col gap-4">
            <Card>
              <Card.Content className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <IconTile icon={ListChecks} tone="accent" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <h2 className="font-medium">{heading}</h2>
                      <InfoTip label={tr("Rekomendasi", "Recommendations")}>
                        {tr(
                          "Dihitung dari data 7 hari terakhir: risiko zona, tren kategori, temuan berulang, respons, kualitas deteksi, dan kesehatan perangkat. Pusat Keputusan menjawab apa yang harus diputuskan sekarang; halaman ini menjawab apa yang perlu diubah minggu ini. Tidak ada yang dijalankan otomatis.",
                          "Computed from the last 7 days: zone risk, category trends, repeat findings, response, detection quality and device health. The Decision Center answers what needs deciding now; this page answers what to change this week. Nothing runs automatically.",
                        )}
                      </InfoTip>
                    </div>
                    <p className="text-sm text-muted">
                      {tr(`${list.length} rekomendasi · ${high} prioritas tinggi · ${done} sudah jadi tindakan`, `${list.length} recommendations · ${high} high priority · ${done} turned into actions`)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip size="sm" color="warning" variant="soft">
                    {tr("Disusun dari aturan · LLM menyusul", "Rule-based · LLM coming")}
                  </Chip>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      navigator.clipboard.writeText(recommendationsMarkdown(list, heading)).then(
                        () => toast.success(tr("Daftar rekomendasi disalin.", "Recommendations copied.")),
                        () => toast.danger(tr("Gagal menyalin.", "Couldn't copy.")),
                      )
                    }
                  >
                    <Copy aria-hidden />
                    {tr("Salin", "Copy")}
                  </Button>
                  <Button size="sm" variant="secondary" onPress={() => download(`rekomendasi-${new Date().toISOString().slice(0, 10)}.md`, recommendationsMarkdown(list, heading))}>
                    <Download aria-hidden />
                    {tr("Unduh", "Download")}
                  </Button>
                </div>
              </Card.Content>
            </Card>

            <ToggleButtonGroup aria-label={tr("Saring menurut area", "Filter by area")} selectionMode="single" disallowEmptySelection selectedKeys={[area]} onSelectionChange={(keys) => setArea([...keys][0] as RecArea | "all")} className="flex-wrap">
              <ToggleButton id="all" size="sm">
                {tr("Semua", "All")} ({list.length})
              </ToggleButton>
              {(Object.keys(areaLabel) as RecArea[])
                .filter((a) => counts.get(a))
                .map((a) => (
                  <ToggleButton key={a} id={a} size="sm">
                    {areaLabel[a]} ({counts.get(a)})
                  </ToggleButton>
                ))}
            </ToggleButtonGroup>

            {featured.length > 0 && (
              <section aria-label={tr("Fokus minggu ini", "Focus this week")} className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-muted">{tr("Fokus minggu ini", "Focus this week")}</h2>
                <div className={cn("grid gap-4", featured.length === 1 ? "" : featured.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3")}>{featured.map((r) => card(r, true))}</div>
              </section>
            )}
            {rest.length > 0 && (
              <section aria-label={tr("Rekomendasi lainnya", "Other recommendations")} className="flex flex-col gap-3">
                {area === "all" && <h2 className="text-sm font-medium text-muted">{tr("Rekomendasi lainnya", "Other recommendations")}</h2>}
                <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", fillLastRow(rest.length))}>{rest.map((r) => card(r))}</div>
              </section>
            )}

            <ActionDrawer
              rec={acting}
              site={filters.site}
              onClose={() => setActing(undefined)}
              onMade={(rec, a) => {
                made.set(rec.id, a)
                setActing(undefined)
                bump((n) => n + 1)
              }}
            />
          </div>
        )
      }}
    </WidgetBody>
  )
}

export function RekomendasiPage() {
  const { key } = useFilters()
  return (
    <div className="flex flex-col gap-4" key={key}>
      {/* No date or shift: the week is fixed and the night-vs-day rule needs every shift. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton fields={["site", "zona"]} />
      </div>
      <Recommendations />
    </div>
  )
}
