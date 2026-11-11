import { Children, isValidElement, type ReactNode } from "react"
import { Card } from "@heroui/react"
import type { LucideIcon } from "lucide-react"
import { A11y, Pagination } from "swiper/modules"
import { Swiper, SwiperSlide } from "swiper/react"
import "swiper/css"
import "swiper/css/a11y"
import "swiper/css/pagination"

import { MiniBar } from "@/shared/components/visual"
import { cn } from "@/shared/lib/utils"

export type KpiTone = "default" | "success" | "warning" | "danger"

const toneText: Record<KpiTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning-ink",
  danger: "text-danger",
}

const toneIcon: Record<KpiTone, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning-ink",
  danger: "text-danger",
}

type KpiCardProps = {
  icon: LucideIcon
  label: string
  value: ReactNode
  /** One line of context: the target, the comparison, or which items are affected. */
  note?: string
  /** Color the value only when it is a real warning or danger state. */
  tone?: KpiTone
  /** A thin bar under the value: a share (online/total) or progress to a target, drawn as a tick. */
  progress?: { value: number; max: number; target?: number }
  /** Shorter card for pages that must fit one screen. */
  compact?: boolean
  className?: string
}

export function KpiCard({ icon: Icon, label, value, note, tone = "default", progress, compact = false, className }: KpiCardProps) {
  return (
    <Card className={cn("min-w-0", compact && "gap-1 py-3", className)}>
      <Card.Header className="flex-row items-center gap-2">
        <Icon className={cn("size-4 shrink-0", toneIcon[tone])} aria-hidden />
        <Card.Title className={cn("min-w-0", compact && "text-sm")}>{label}</Card.Title>
      </Card.Header>
      <Card.Content className={cn(compact && "gap-0.5")}>
        <p className={cn("font-semibold font-display", compact ? "text-xl" : "text-2xl", toneText[tone])}>{value}</p>
        {progress && <MiniBar value={progress.value} max={progress.max} marker={progress.target} tone={tone === "default" ? "accent" : tone} className="my-1" />}
        {note && <Card.Description>{note}</Card.Description>}
      </Card.Content>
    </Card>
  )
}

/** Swipeable on phones and tablets (the next card peeks in), one locked row on desktop. */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children)
  return (
    <Swiper
      modules={[Pagination, A11y]}
      spaceBetween={12}
      slidesPerView={1.15}
      breakpoints={{ 640: { slidesPerView: 2.2 }, 1024: { slidesPerView: items.length } }}
      pagination={{ clickable: true }}
      className={cn(
        "w-full pb-7! lg:pb-0! [--swiper-pagination-bottom:0] [--swiper-pagination-bullet-inactive-color:var(--foreground)] [--swiper-theme-color:var(--accent)]",
        className,
      )}
    >
      {items.map((child, i) => (
        <SwiperSlide key={isValidElement(child) ? child.key : i} className="h-auto! *:h-full">
          {child}
        </SwiperSlide>
      ))}
    </Swiper>
  )
}
