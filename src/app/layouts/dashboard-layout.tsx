import { useEffect, useState } from "react"
import { Alert, Avatar, Button, Disclosure, Drawer, Dropdown, Label, ListBox, ScrollShadow, Select } from "@heroui/react"
import { ChevronRight, LogOut, PanelLeft } from "lucide-react"
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router"

import { BrandMark } from "@/shared/components/brand-image"
import { useSetParams } from "@/shared/components/filter-bar"
import { LangToggle } from "@/shared/components/lang-toggle"
import { NotificationBell } from "@/app/components/notification-bell"
import { SessionTimer } from "@/app/components/session-timer"
import { allItems, footerNav, groupOf, isItemOn, navFor, type NavGroup, type NavItem } from "@/app/config/nav"
import { siteOptions } from "@/shared/data/scope"
import { logout, roleLabel, setActiveSite, useSession } from "@/shared/auth/session"
import { loadSettings, subscribeSettingsUpdated, useSettings } from "@/shared/data/settings"
import { cn } from "@/shared/lib/utils"
import { tr } from "@/shared/lib/i18n"

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-9 items-center gap-3 rounded-full px-2.5 text-sm text-foreground/80 transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground max-lg:text-base pointer-coarse:h-11",
    isActive && "bg-foreground/8 font-medium text-foreground hover:bg-foreground/8",
  )

/** Text that fades while the rail narrows. Icons keep their x position in both states, so only text moves. */
const fade = (collapsed: boolean) =>
  cn("transition-opacity duration-150 motion-reduce:transition-none", collapsed ? "opacity-0" : "opacity-100 delay-75")

function RailLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end onClick={onNavigate} title={collapsed ? item.label : undefined} className={linkClass}>
      <Icon className="size-4.5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className={cn("truncate", fade(collapsed))}>{item.label}</span>
    </NavLink>
  )
}

const OPEN_KEY = "hse-nav-open"

/**
 * Which sidebar groups are open, kept per browser so the user's choice survives a reload. A group
 * the user hasn't touched follows its `startClosed`. Landing on a page inside a closed group opens
 * that group, so the active item is never hidden.
 */
function useOpenGroups(groups: NavGroup[], pathname: string) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, boolean>
    } catch {
      return {}
    }
  })
  const isOpen = (g: NavGroup) => open[g.id] ?? !g.startClosed
  const [seenPath, setSeenPath] = useState<string | null>(null)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    const active = groups.find((g) => g.items.some((item) => item.to === pathname))
    if (active && !isOpen(active)) setOpen({ ...open, [active.id]: true })
  }
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(open))
    } catch {
      // Private mode or blocked storage: the groups still work, they just aren't remembered.
    }
  }, [open])
  return { isOpen, setGroupOpen: (id: string, value: boolean) => setOpen((prev) => ({ ...prev, [id]: value })) }
}

function Sidebar({
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  collapsed?: boolean
  onToggle: () => void
  onNavigate?: () => void
}) {
  // navFor reads the settings store during render, which the React Compiler would cache once.
  "use no memo"
  const { brand } = useSettings()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useSession()
  const groups = navFor(user?.role ?? "viewer")
  const { isOpen, setGroupOpen } = useOpenGroups(groups, pathname)
  const initials = (user?.nama ?? "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
  return (
    <div className="flex h-full flex-col bg-surface text-foreground [font-family:var(--font-display)]">
      {/* Logo and name sit behind the toggle. On the rail the toggle lands on the logo,
          which gives way to the toggle icon on hover or keyboard focus. */}
      <div className="relative flex h-14 shrink-0 items-center justify-end pr-3">
        <span
          className={cn("absolute inset-y-0 right-14 left-12 content-center truncate text-[15px] font-semibold", fade(collapsed))}
        >
          {brand.appName}
        </span>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={collapsed ? tr("Tampilkan sidebar", "Show sidebar") : tr("Sembunyikan sidebar", "Hide sidebar")}
          aria-expanded={!collapsed}
          className="group/toggle peer relative shrink-0"
          onPress={onToggle}
        >
          <PanelLeft
            className={cn(
              "size-4.5 transition-opacity duration-150",
              collapsed && "opacity-0 group-hover/toggle:opacity-100 group-focus-visible/toggle:opacity-100",
            )}
            strokeWidth={1.5}
          />
        </Button>
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 left-4.5 -translate-y-1/2 transition-opacity duration-150",
            collapsed && "peer-hover:opacity-0 peer-focus-visible:opacity-0",
          )}
        >
          <BrandMark brand={brand} className="size-5" />
        </span>
      </div>
      <ScrollShadow hideScrollBar className="min-h-0 flex-1 px-2 pb-3">
        <nav aria-label={tr("Menu utama", "Main menu")} className="flex flex-col gap-0.5">
          {groups.map((group) =>
            group.label && !collapsed ? (
              <Disclosure key={group.id} isExpanded={isOpen(group)} onExpandedChange={(v) => setGroupOpen(group.id, v)} className="mt-4">
                <Disclosure.Heading>
                  <Disclosure.Trigger className="flex h-8 w-full items-center justify-between rounded-full pr-3 pl-2.5 text-xs text-foreground/60 transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground pointer-coarse:h-11">
                    {group.label}
                    <Disclosure.Indicator className="size-3.5" />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="flex flex-col gap-0.5 pt-0.5">
                    {group.items.map((item) => (
                      <RailLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
                    ))}
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            ) : (
              // On the rail every group is open and its label row folds to zero height with the width.
              <div key={group.id} className="flex flex-col gap-0.5">
                {group.label && (
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
                      collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <p className={cn("truncate px-2.5 pt-5 pb-2 text-xs text-foreground/60", fade(collapsed))}>
                        {group.label}
                      </p>
                    </div>
                  </div>
                )}
                {group.items.map((item) => (
                  <RailLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
              </div>
            ),
          )}
        </nav>
      </ScrollShadow>
      <div className="border-t border-foreground/8 p-2 pb-[max(--spacing(2),env(safe-area-inset-bottom))]">
        <Dropdown>
          <Dropdown.Trigger className="flex h-10 w-full items-center gap-3 overflow-hidden rounded-full pr-3 pl-1 text-left transition-colors duration-150 hover:bg-foreground/5">
            <Avatar size="sm" className="shrink-0">
              <Avatar.Fallback className="bg-brand-accent text-brand-accent-foreground">{initials}</Avatar.Fallback>
            </Avatar>
            <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", fade(collapsed))}>{user?.nama}</span>
            <ChevronRight
              className={cn("size-4 shrink-0 text-foreground/80", fade(collapsed))}
              strokeWidth={1.5}
              aria-hidden
            />
          </Dropdown.Trigger>
          {/* The sheet has no room to its right, so the menu opens upward there. */}
          <Dropdown.Popover placement={onNavigate ? "top start" : "right bottom"} className="min-w-56">
            <div className="px-3 pt-3 pb-1">
              <p className="text-sm font-medium">{user?.nama}</p>
              <p className="text-xs text-muted">{user && roleLabel[user.role]}</p>
            </div>
            <Dropdown.Menu
              onAction={(key) => {
                // Signing out needs no navigate: the layout sends a signed-out user to the login page.
                if (key === logoutItem.to) logout()
                else navigate(String(key))
                onNavigate?.()
              }}
            >
              {[...footerNav, logoutItem].map(({ to, label, icon: Icon }) => (
                <Dropdown.Item key={to} id={to} textValue={label}>
                  <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.5} aria-hidden />
                  <Label>{label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </div>
  )
}

const logoutItem: NavItem = { to: "/login", get label() { return tr("Keluar", "Sign out") }, icon: LogOut }

/**
 * The site the whole app looks at. Each page's site filter starts from it and can differ;
 * picking a site here drops the page's own site and zone so the page follows.
 */
function SitePicker() {
  // Reads the master and session stores during render, which the React Compiler would cache once.
  "use no memo"
  const { activeSite } = useSession()
  const setParams = useSetParams()
  const options = siteOptions()
  return (
    <Select
      className="w-44 max-sm:hidden"
      value={activeSite}
      isDisabled={options.length < 2}
      onChange={(value) => {
        if (!value) return
        setActiveSite(String(value))
        setParams({ site: null, zona: null })
      }}
    >
      <Label className="sr-only">{tr("Site aktif", "Active site")}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

/** Sidebar beside the work area. Desktop narrows it to an icon rail; below lg it opens as a left sheet. */
export function DashboardLayout() {
  // Reads the settings store during render, which the React Compiler would cache once.
  "use no memo"
  const [collapsed, setCollapsed] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [settingsChanged, setSettingsChanged] = useState(false)
  const { pathname, search } = useLocation()
  const { session, activeSite, endReason: reason } = useSession()
  const { modules } = useSettings()
  const page = allItems.find((item) => item.to === pathname && isItemOn(item))
  const group = page && groupOf(page)
  const signedIn = Boolean(session)
  useEffect(() => {
    if (!signedIn) return
    loadSettings("full")
    return subscribeSettingsUpdated(() => setSettingsChanged(true))
  }, [signedIn])
  if (!session) {
    // After "Keluar" the next user starts fresh; otherwise come back here after signing in.
    const query = reason === "keluar" ? "" : `?${new URLSearchParams({ next: pathname + search, ...(reason && { alasan: reason }) })}`
    return <Navigate to={`/login${query}`} replace />
  }
  return (
    <div className="min-h-dvh lg:flex">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r border-foreground/8 transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:block",
          collapsed ? "w-14" : "w-63",
        )}
      >
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      <Drawer.Backdrop isOpen={sheetOpen} onOpenChange={setSheetOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog aria-label="Menu" className="p-0">
            <Sidebar onToggle={() => setSheetOpen(false)} onNavigate={() => setSheetOpen(false)} />
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="px-4 pt-4 pb-2 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                isIconOnly
                variant="tertiary"
                aria-label={tr("Buka menu", "Open menu")}
                aria-expanded={sheetOpen}
                className="size-11 lg:hidden"
                onPress={() => setSheetOpen(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="size-5" aria-hidden>
                  <path d="M4 9h16M4 15h10" />
                </svg>
              </Button>
              <nav aria-label="Breadcrumb" className="max-sm:hidden">
                <ol className="flex items-center gap-1.5 text-sm text-muted">
                  <li>{group?.label ?? tr("Halaman", "Pages")}</li>
                  {page && (
                    <>
                      <li aria-hidden>/</li>
                      <li aria-current="page">{page.label}</li>
                    </>
                  )}
                </ol>
              </nav>
            </div>
            <div className="flex items-center justify-end gap-2">
              <LangToggle />
              <SitePicker />
              {/* Remounted when modules change, so it resubscribes to the topics still on. */}
              <NotificationBell key={`${activeSite}|${Object.values(modules).join()}`} />
            </div>
          </div>
          {page && (
            <div className="mt-2 lg:mt-4">
              <h1 className="mt-1 truncate font-display text-3xl font-bold! tracking-tight lg:text-[34px]">{page.label}</h1>
            </div>
          )}
        </header>
        <SessionTimer />
        {settingsChanged && (
          <div className="px-4 pt-2 lg:px-6">
            <Alert status="accent">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{tr("Pengaturan berubah, muat ulang", "Settings changed, reload")}</Alert.Title>
                <Alert.Description>Super Admin mengubah branding atau modul. Muat ulang untuk memakai pengaturan terbaru; halaman ini tidak ditutup.</Alert.Description>
              </Alert.Content>
              {/* Applies the new settings in place: no page reload, and a module that went off sends the user home. */}
              <Button
                size="sm"
                variant="secondary"
                onPress={async () => {
                  await loadSettings("full")
                  setSettingsChanged(false)
                }}
              >
                {tr("Muat ulang", "Reload")}
              </Button>
            </Alert>
          </div>
        )}
        <main className="flex-1 px-4 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
