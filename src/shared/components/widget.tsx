import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Alert, Button, Card, EmptyState, Popover } from "@heroui/react"
import { Info } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { tr } from "@/shared/lib/i18n"

/** An (i) button that opens a short explanation: rules and method notes stay reachable without filling the card. */
export function InfoTip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Popover>
      <Button isIconOnly size="sm" variant="ghost" aria-label={tr(`Tentang ${label}`, `About ${label}`)} className="size-6 min-w-6 text-muted">
        <Info className="size-3.5" aria-hidden />
      </Button>
      <Popover.Content placement="bottom start" className="max-w-xs">
        <Popover.Dialog className="p-3 text-sm leading-relaxed">{children}</Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

/**
 * Inside a tab panel or a card that already has its own heading, widgets drop their card and title
 * (the tab says what it is) and keep only their action and body. Wrap the content in this.
 */
const Bare = createContext(false)
export const BareWidgets = ({ children }: { children: ReactNode }) => <Bare.Provider value>{children}</Bare.Provider>

/**
 * A dashboard panel: an h2 title, an action, then the body. `description` (how it is computed, the
 * rule behind it) sits behind an (i) button; `subtitle` is a short visible line for live data.
 */
export function Widget({
  title,
  description,
  subtitle,
  action,
  className,
  fill = false,
  children,
}: {
  title: string
  description?: string
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
  /** The body takes the card's remaining height, for content that stretches (a heatmap in a tab). */
  fill?: boolean
  children: ReactNode
}) {
  const bare = useContext(Bare)
  if (bare)
    return (
      <div className={cn("flex min-w-0 flex-col gap-3", fill && "h-full min-h-0")}>
        {(action || subtitle) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : <span />}
            {action}
          </div>
        )}
        <div className={cn(fill && "flex min-h-0 flex-1 flex-col")}>{children}</div>
      </div>
    )
  return (
    <Card className={cn("min-w-0", className)}>
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <Card.Title render={(props) => <h2 {...props} />}>{title}</Card.Title>
            {description && <InfoTip label={title}>{description}</InfoTip>}
          </div>
          {subtitle && <Card.Description>{subtitle}</Card.Description>}
        </div>
        {action}
      </Card.Header>
      <Card.Content className={cn(fill && "flex min-h-0 flex-1 flex-col")}>{children}</Card.Content>
    </Card>
  )
}

/**
 * A long list beside shorter panels. It adds no height of its own to the grid row (the content is
 * absolutely placed), so the row takes its height from its siblings and the list scrolls inside it.
 * `min` is the floor for when the panel stands alone, e.g. on narrow screens.
 */
export function ScrollFill({ min = "min-h-80", className, children }: { min?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("relative flex-1", min)}>
      <div className={cn("absolute inset-0 overflow-y-auto overscroll-contain", className)}>{children}</div>
    </div>
  )
}

/** Charts refresh on this timer; only feeds and tables are live. */
export const REFRESH_MS = 60_000

export type WidgetQuery<T> = { data?: T; error?: Error; isLoading: boolean; retry: () => void }

/**
 * Loads one widget's data. A new `key` (the filters) shows the skeleton again; a
 * timed refresh keeps the current data on screen, and a failed refresh is ignored.
 */
/**
 * `version` reloads in place without the skeleton, for data the user just changed (a review saved,
 * an action verified) so the rows don't flash.
 */
export function useWidgetData<T>(load: () => Promise<T>, key: string, refreshMs?: number, version?: number): WidgetQuery<T> {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: T; error?: Error } | null>(null)
  const runKey = `${key}#${attempt}`

  useEffect(() => {
    let alive = true
    const run = (isRefresh: boolean) =>
      load().then(
        (data) => {
          if (alive) setResult({ key: runKey, data })
        },
        (error: Error) => {
          if (alive && !isRefresh) setResult({ key: runKey, error })
        },
      )
    run(false)
    const timer = refreshMs ? setInterval(() => run(true), refreshMs) : undefined
    return () => {
      alive = false
      clearInterval(timer)
    }
    // `load` is a new closure every render; `runKey` already captures its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, refreshMs])

  useEffect(() => {
    if (!version) return
    let alive = true
    load().then(
      (data) => alive && setResult({ key: runKey, data }),
      () => {},
    )
    return () => {
      alive = false
    }
    // Only a new version triggers this; the main effect handles key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const current = result?.key === runKey ? result : null
  return { data: current?.data, error: current?.error, isLoading: !current, retry: () => setAttempt((n) => n + 1) }
}

/** Shows the skeleton, the error with a retry, or the empty message, so each widget fails on its own. */
export function WidgetBody<T>({
  query,
  skeleton,
  isEmpty,
  empty,
  children,
}: {
  query: WidgetQuery<T>
  skeleton: ReactNode
  isEmpty: (data: T) => boolean
  empty: string
  children: (data: T) => ReactNode
}) {
  if (query.error) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{tr("Data gagal dimuat", "Data failed to load")}</Alert.Title>
          <Alert.Description>{query.error.message}</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="secondary" onPress={query.retry}>
          {tr("Coba lagi", "Try again")}
        </Button>
      </Alert>
    )
  }
  if (query.data === undefined) {
    return (
      <div aria-busy="true">
        <span className="sr-only">{tr("Memuat data…", "Loading data…")}</span>
        {skeleton}
      </div>
    )
  }
  if (isEmpty(query.data)) {
    return (
      <EmptyState>
        <p>{empty}</p>
      </EmptyState>
    )
  }
  return children(query.data)
}
