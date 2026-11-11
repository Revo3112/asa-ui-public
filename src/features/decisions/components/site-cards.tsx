import { Card, Skeleton } from "@heroui/react"
import { Cctv, HardDrive, Satellite, Timer } from "lucide-react"

import { SourceStatusChip } from "@/shared/components/status-chip"
import { useFilters } from "@/shared/components/filter-bar"
import { MiniBar } from "@/shared/components/visual"
import { InfoTip, REFRESH_MS, useWidgetData, WidgetBody } from "@/shared/components/widget"
import { getSiteCards, type SiteCard } from "@/features/decisions/data/keputusan"
import { cn } from "@/shared/lib/utils"
import { tr } from "@/shared/lib/i18n"

const lagText = (s?: number) => (s === undefined ? "—" : s < 120 ? tr(`${s} dtk`, `${s} s`) : tr(`${Math.round(s / 60)} mnt`, `${Math.round(s / 60)} min`))

function SiteHealth({ card }: { card: SiteCard }) {
  const link = card.uplink
  return (
    <Card className="min-w-0">
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Card.Title render={(props) => <h3 {...props} />}>{card.nama}</Card.Title>
          <InfoTip label={card.nama}>{tr("Inference di site, hanya event dan thumbnail yang naik ke HQ.", "Inference on site; only events and thumbnails go up to HQ.")}</InfoTip>
        </div>
        <SourceStatusChip value={card.status} />
      </Card.Header>
      <Card.Content>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-muted">
              <Satellite className="size-3.5" aria-hidden />
              {link?.media === "satelit" ? "Starlink" : "Uplink"}
            </dt>
            <dd className={cn(link?.status !== "online" && "text-warning-ink")}>
              {link ? `${link.id} · ${link.telemetry.uplinkMbps ?? "?"} Mbps` : "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-muted">
              <HardDrive className="size-3.5" aria-hidden />
              {tr("Server edge", "Edge server")}
            </dt>
            <dd className={cn("flex flex-col gap-1", card.edge?.status !== "online" && "text-warning-ink")}>
              {card.edge ? `${card.edge.id} · GPU ${card.edge.telemetry.gpuLoad ?? "?"}%` : "—"}
              {card.edge?.telemetry.gpuLoad !== undefined && <MiniBar value={card.edge.telemetry.gpuLoad} max={100} tone={card.edge.telemetry.gpuLoad > 85 ? "warning" : "accent"} />}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-muted">
              <Cctv className="size-3.5" aria-hidden />
              {tr("Kamera online", "Cameras online")}
            </dt>
            <dd className={cn("flex flex-col gap-1", card.cameras.down.length > 0 && "text-danger")}>
              {card.cameras.online}/{card.cameras.total}
              <MiniBar value={card.cameras.online} max={card.cameras.total} tone={card.cameras.down.length ? "danger" : "success"} />
              {card.cameras.down.length > 0 && <span className="text-xs">{card.cameras.down.join(", ")}</span>}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-muted">
              <Timer className="size-3.5" aria-hidden />
              {tr("Jeda sinkron (median)", "Sync lag (median)")}
            </dt>
            <dd>
              {lagText(card.lagP50)}
              <span className="block text-xs text-muted">{tr("Antrean edge", "Edge queue")} {card.queue}</span>
            </dd>
          </div>
        </dl>
        {card.devices.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-xs">
            {card.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5 rounded-lg bg-default px-2 py-1">
                <span>{d.id}</span>
                {d.telemetry.battery !== undefined && <span className={cn(d.telemetry.battery < 30 ? "text-danger" : "text-muted")}>{d.telemetry.battery}%</span>}
                <SourceStatusChip value={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  )
}

/** One card per site: link, edge server, cameras, sync lag, and the poles and Manpacks there. */
export function SiteCards({ version }: { version?: number }) {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getSiteCards(filters), key, REFRESH_MS, version)
  return (
    <WidgetBody
      query={query}
      skeleton={
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      }
      isEmpty={(cards) => !cards.length}
      empty={tr("Tidak ada site untuk filter ini.", "No sites for these filters.")}
    >
      {(cards) => (
        // One or two sites fill the row instead of sitting in a three-column grid with empty slots.
        <div className={cn("grid gap-4", cards.length === 1 ? "" : cards.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3")}>
          {cards.map((c) => (
            <SiteHealth key={c.site} card={c} />
          ))}
        </div>
      )}
    </WidgetBody>
  )
}
