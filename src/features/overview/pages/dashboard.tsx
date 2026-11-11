import { buttonVariants, Card, Skeleton } from "@heroui/react"
import { BellRing, CalendarX, Cctv, HardHat, type LucideIcon } from "lucide-react"
import { Link } from "react-router"

import { useFilters } from "@/shared/components/filter-bar"
import { KpiCard, KpiGrid } from "@/shared/components/kpi-card"
import { SiteMap } from "@/features/devices/components/site-map"
import { REFRESH_MS, useWidgetData, WidgetBody } from "@/shared/components/widget"
import { TARGET_KEPATUHAN } from "@/shared/config/apd"
import type { DecisionTone } from "@/features/decisions/data/keputusan"
import { getOverview, getPpeToday } from "@/features/overview/data/overview"
import { isModuleOn, useSettings } from "@/shared/data/settings"
import { locale, tr } from "@/shared/lib/i18n"
import { cn } from "@/shared/lib/utils"
import { useWorkflowVersion } from "@/shared/lib/workflow-ui"

const toneDot: Record<DecisionTone, string> = { danger: "bg-danger", warning: "bg-warning", accent: "bg-accent" }
const pct = (v: number) => `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(v)}%`

function Loading() {
  return <Skeleton render={(p) => <span {...p} />} className="inline-block h-8 w-16 rounded-md align-middle" />
}

/**
 * The first screen: where every site is and what state it is in, the four numbers that matter, and
 * the few things someone has to act on now. Everything else is one click away.
 */
export function DashboardPage() {
  "use no memo"
  useSettings()
  const { filters, key } = useFilters()
  const version = useWorkflowVersion()
  // The map is the whole country: every site this user may see, whatever the header picker says.
  const scope = { ...filters, site: "all", zona: "all" }
  const query = useWidgetData(() => getOverview(scope), `${key}|overview`, REFRESH_MS, version)
  const ppe = useWidgetData(() => getPpeToday(scope), `${key}|ppe`, REFRESH_MS)
  const d = query.data
  const cams = d?.sites.reduce((a, s) => ({ online: a.online + s.cameras.online, total: a.total + s.cameras.total }), { online: 0, total: 0 })
  const down = d?.sites.flatMap((s) => s.points.filter((p) => p.jenis === "kamera" && p.status === "offline").map((p) => p.id)) ?? []

  const cards: { show: boolean; icon: LucideIcon; label: string; value: React.ReactNode; note?: string; tone?: "default" | "warning" | "danger"; progress?: { value: number; max: number; target?: number }; to: string }[] = [
    {
      show: isModuleOn("ppe"),
      icon: HardHat,
      label: tr("Kepatuhan APD hari ini", "PPE compliance today"),
      value: ppe.data ? pct(ppe.data.kepatuhan) : ppe.data === null ? "–" : <Loading />,
      note: `Target ${TARGET_KEPATUHAN}%`,
      tone: ppe.data && ppe.data.kepatuhan < TARGET_KEPATUHAN ? "warning" : "default",
      progress: ppe.data ? { value: ppe.data.kepatuhan, max: 100, target: TARGET_KEPATUHAN } : undefined,
      to: "/apd",
    },
    {
      show: isModuleOn("indikasi"),
      icon: BellRing,
      label: tr("Kritis belum ditangani", "Critical, not handled"),
      value: d ? d.kpis.unhandled : <Loading />,
      note: d?.kpis.unhandledBreached ? tr(`${d.kpis.unhandledBreached} lewat SLA`, `${d.kpis.unhandledBreached} past SLA`) : undefined,
      tone: d?.kpis.unhandled ? "danger" : "default",
      to: "/indikasi?status=baru",
    },
    {
      show: isModuleOn("tindakan"),
      icon: CalendarX,
      label: tr("Tindakan terlambat", "Overdue actions"),
      value: d ? d.kpis.overdue : <Loading />,
      note: d ? tr(`dari ${d.kpis.openActions} terbuka`, `of ${d.kpis.openActions} open`) : undefined,
      tone: d?.kpis.overdue ? "warning" : "default",
      to: "/tindakan",
    },
    {
      show: true,
      icon: Cctv,
      label: tr("Kamera online", "Cameras online"),
      value: cams ? `${cams.online}/${cams.total}` : <Loading />,
      note: down.length ? tr(`${down.slice(0, 2).join(", ")} offline`, `${down.slice(0, 2).join(", ")} offline`) : undefined,
      tone: down.length ? "danger" : "default",
      progress: cams ? { value: cams.online, max: Math.max(1, cams.total) } : undefined,
      to: "/sumber",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        {cards
          .filter((c) => c.show)
          .map((c) => (
            <Link key={c.label} to={c.to} className="block h-full rounded-3xl focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none">
              <KpiCard icon={c.icon} label={c.label} value={c.value} note={c.note} tone={c.tone} progress={c.progress} className="h-full transition-shadow hover:shadow-md" />
            </Link>
          ))}
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {d ? <SiteMap sites={d.sites} className="h-[min(68vh,40rem)] min-h-96" /> : <Skeleton className="h-[min(68vh,40rem)] min-h-96 rounded-2xl" />}

        <Card className="min-w-0">
          <Card.Header>
            <Card.Title render={(p) => <h2 {...p} />}>{tr("Perlu perhatian", "Needs attention")}</Card.Title>
          </Card.Header>
          <Card.Content>
            <WidgetBody
              query={query}
              skeleton={
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              }
              isEmpty={(x) => !x.attention.length}
              empty={tr("Semua aman. Tidak ada yang perlu ditindak sekarang.", "All clear. Nothing needs action right now.")}
            >
              {(x) => (
                <ol className="flex flex-col gap-1">
                  {x.attention.map((a) => (
                    <li key={a.id}>
                      <Link to={a.cta.href} className="flex items-start gap-2.5 rounded-xl p-2.5 hover:bg-default">
                        <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", toneDot[a.tone])} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug">{a.title}</span>
                          <span className="block truncate text-xs text-muted">{a.facts.slice(0, 2).join(" · ")}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </WidgetBody>
            {isModuleOn("keputusan") && (
              <Link to="/keputusan" className={buttonVariants({ size: "sm", variant: "tertiary", className: "mt-2 w-full" })}>
                {tr("Semua di Pusat Keputusan", "All in the Decision Center")}
              </Link>
            )}
          </Card.Content>
        </Card>
      </div>
    </div>
  )
}
