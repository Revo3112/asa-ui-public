import { useEffect, useState } from "react"
import { Button, Disclosure, Drawer, Label, ListBox, ScrollShadow, SearchField, Select } from "@heroui/react"
import { ChevronRight, ChevronsLeft, ChevronsRight, House, Menu, Moon, Sun } from "lucide-react"
import { Link, NavLink, useNavigate, useParams } from "react-router"

import { BrandMark } from "@/shared/components/brand-image"
import { presets } from "@/shared/config/defaults"
import { previewSettings, useSettings } from "@/shared/data/settings"
import { cn } from "@/shared/lib/utils"
import { StorybookIndex } from "@/features/storybook/pages/storybook"
import { groups, stories, type Story } from "@/features/storybook/stories/registry"

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-default pointer-coarse:min-h-11",
    isActive && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
  )

const SEARCH_ID = "cari-komponen"

/** The catalog's own light/dark switch, so every component can be checked in both themes. */
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("storybook-tema") === "gelap"
    } catch {
      return false
    }
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try {
      localStorage.setItem("storybook-tema", dark ? "gelap" : "terang")
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
    // The dashboard has no theme switch, so leaving the catalog puts it back to light.
    return () => document.documentElement.classList.remove("dark")
  }, [dark])
  return [dark, setDark] as const
}

const SAVED = "tersimpan"

/**
 * The catalog's decorator: every story renders under the picked preset, without saving it, to show
 * branding and modules change while component code stays the same. Leaving the catalog drops it.
 */
function usePreset() {
  const [preset, setPreset] = useState(SAVED)
  useEffect(() => {
    previewSettings(presets.find((p) => p.id === preset)?.settings ?? null)
  }, [preset])
  useEffect(() => () => previewSettings(null), [])
  return [preset, setPreset] as const
}

function PresetPicker({ preset, onChange, className }: { preset: string; onChange: (id: string) => void; className?: string }) {
  return (
    <Select className={className} value={preset} onChange={(id) => id && onChange(String(id))}>
      <Label className="sr-only">Preset branding</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {[{ id: SAVED, label: "Pengaturan tersimpan" }, ...presets].map((p) => (
            <ListBox.Item key={p.id} id={p.id} textValue={p.label}>
              {p.id === SAVED ? p.label : `Preset: ${p.label}`}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

function SearchBox({
  query,
  onQuery,
  onNavigate,
  id,
  className,
}: {
  query: string
  onQuery: (q: string) => void
  onNavigate?: () => void
  id?: string
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <SearchField
      className={className}
      value={query}
      onChange={onQuery}
      // Enter opens the first match, the way a docs search jumps to its top hit.
      onSubmit={(q) => {
        const hit = stories.find((s) => s.label.toLowerCase().includes(q.trim().toLowerCase()))
        if (!hit) return
        navigate(`/storybook/${hit.slug}`)
        onQuery("")
        onNavigate?.()
      }}
    >
      <Label className="sr-only">Cari komponen</Label>
      <SearchField.Group className="w-full">
        <SearchField.SearchIcon />
        <SearchField.Input id={id} placeholder="Cari komponen" className="w-0 min-w-0 flex-1" />
        <SearchField.ClearButton />
        {id && !query && <kbd className="mr-2 rounded border border-border px-1.5 font-sans text-xs whitespace-nowrap text-muted">Ctrl K</kbd>}
      </SearchField.Group>
    </SearchField>
  )
}

function Sidebar({ query, onNavigate }: { query: string; onNavigate?: () => void }) {
  const q = query.trim().toLowerCase()
  const matches = stories.filter((s) => !q || s.label.toLowerCase().includes(q))
  return (
    <nav aria-label="Komponen" className="flex flex-col gap-1 p-3">
      <NavLink to="/storybook" end onClick={onNavigate} className={linkClass}>
        Pengantar
      </NavLink>
      {groups.map((group) => {
        const items = matches.filter((s) => s.group === group)
        if (items.length === 0) return null
        const links = items.map((s) => (
          <NavLink key={s.slug} to={`/storybook/${s.slug}`} onClick={onNavigate} className={linkClass}>
            {s.label}
          </NavLink>
        ))
        // While searching every match shows, so the groups stay open and lose their toggle.
        return q ? (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="px-3 pt-3 pb-1 text-xs text-muted">{group}</p>
            {links}
          </div>
        ) : (
          <Disclosure key={group} defaultExpanded>
            <Disclosure.Heading>
              <Disclosure.Trigger className="flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors duration-150 hover:bg-default pointer-coarse:min-h-11">
                {group}
                <Disclosure.Indicator className="size-4 text-muted" />
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="flex flex-col gap-0.5 pt-0.5 pl-3">{links}</Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        )
      })}
      {matches.length === 0 && <p className="px-3 py-2 text-sm text-muted">Tidak ada komponen yang cocok dengan “{query}”.</p>}
    </nav>
  )
}

function StoryPage({ story }: { story: Story }) {
  const i = stories.indexOf(story)
  const prev = stories[i - 1]
  const next = stories[i + 1]
  return (
    <>
      <div className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            <li>
              <Link to="/storybook" aria-label="Pengantar" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-default hover:text-foreground pointer-coarse:size-11">
                <House className="size-4" aria-hidden />
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5 text-muted" />
            </li>
            <li className="px-1.5 text-muted">{story.group}</li>
            <li aria-hidden>
              <ChevronRight className="size-3.5 text-muted" />
            </li>
            <li aria-current="page" className="rounded-full bg-primary/10 px-3 py-1 text-primary">
              {story.label}
            </li>
          </ol>
        </nav>
        <p className="self-start rounded-md bg-ink px-2 py-0.5 font-mono text-xs text-on-ink">{story.source}</p>
        <h1 className="font-display text-4xl font-bold! tracking-tight lg:text-5xl">{story.label}</h1>
      </div>
      <story.Component />
      <nav aria-label="Story sebelum dan sesudahnya" className="grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
        {prev && (
          <Link to={`/storybook/${prev.slug}`} className="flex flex-col gap-1 rounded-xl border border-border p-4 transition-colors duration-150 hover:border-primary">
            <span className="text-sm text-muted">Sebelumnya</span>
            <span className="font-medium text-primary">« {prev.label}</span>
          </Link>
        )}
        {next && (
          <Link
            to={`/storybook/${next.slug}`}
            className="flex flex-col gap-1 rounded-xl border border-border p-4 text-right transition-colors duration-150 hover:border-primary sm:col-start-2"
          >
            <span className="text-sm text-muted">Berikutnya</span>
            <span className="font-medium text-primary">{next.label} »</span>
          </Link>
        )}
      </nav>
    </>
  )
}

/** Docs-style shell for the component catalog: top bar, grouped sidebar, and one story at /storybook/:slug. */
export function StorybookLayout() {
  const { slug } = useParams()
  const story = stories.find((s) => s.slug === slug)
  const [dark, setDark] = useDarkMode()
  const [preset, setPreset] = usePreset()
  const { brand } = useSettings()
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        document.getElementById(SEARCH_ID)?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn("rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-white/10 hover:text-white", isActive && "font-medium text-white")

  return (
    <div className="min-h-dvh bg-surface">
      <header className="twill sticky top-0 z-30 flex h-14 items-center gap-2 px-3 text-rail-foreground lg:gap-4 lg:px-5">
        <Button variant="ghost" size="sm" className="text-rail-foreground hover:bg-white/10 lg:hidden" onPress={() => setMenuOpen(true)}>
          <Menu aria-hidden />
          Menu
        </Button>
        <Link to="/storybook" className="flex min-w-0 items-center gap-2 font-display text-[15px] text-white">
          <BrandMark brand={brand} className="size-6 shrink-0" />
          <span className="truncate">{brand.appName}</span>
        </Link>
        <nav aria-label="Utama" className="hidden items-center gap-1 md:flex">
          <NavLink to="/storybook" className={navLink}>
            Komponen
          </NavLink>
          <NavLink to="/" end className={navLink}>
            Dashboard
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <PresetPicker preset={preset} onChange={setPreset} className="hidden w-56 lg:block" />
          <SearchBox id={SEARCH_ID} query={query} onQuery={setQuery} className="hidden w-64 lg:block" />
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={dark ? "Pakai tema terang" : "Pakai tema gelap"}
            className="text-rail-foreground hover:bg-white/10"
            onPress={() => setDark(!dark)}
          >
            {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </Button>
        </div>
      </header>

      <div className="lg:flex">
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r border-border bg-surface lg:flex",
            collapsed ? "w-12" : "w-72",
          )}
        >
          {!collapsed && (
            <ScrollShadow hideScrollBar className="min-h-0 flex-1">
              <Sidebar query={query} />
            </ScrollShadow>
          )}
          <button
            type="button"
            aria-label={collapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"}
            aria-expanded={!collapsed}
            className="mt-auto flex h-11 w-full shrink-0 items-center justify-center border-t border-border text-muted transition-colors duration-150 hover:bg-default hover:text-foreground"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronsRight className="size-5" aria-hidden /> : <ChevronsLeft className="size-5" aria-hidden />}
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-12 lg:py-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-10">
            {story ? (
              <StoryPage key={story.slug} story={story} />
            ) : slug ? (
              <div className="flex flex-col items-start gap-3">
                <h1 className="font-display text-3xl">Komponen tidak ditemukan</h1>
                <p className="text-muted">Tidak ada story di /storybook/{slug}. Pilih komponen dari daftar, atau kembali ke pengantar.</p>
                <Link to="/storybook" className="text-link underline-offset-4 hover:underline">
                  Kembali ke pengantar
                </Link>
              </div>
            ) : (
              <StorybookIndex />
            )}
          </div>
        </main>
      </div>

      <Drawer.Backdrop isOpen={menuOpen} onOpenChange={setMenuOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>Komponen</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-2 px-0">
              <SearchBox query={query} onQuery={setQuery} onNavigate={() => setMenuOpen(false)} className="px-3" />
              <PresetPicker preset={preset} onChange={setPreset} className="px-3" />
              <Sidebar query={query} onNavigate={() => setMenuOpen(false)} />
              <div className="mx-3 border-t border-border pt-2">
                <Link to="/" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-link hover:bg-default">
                  Kembali ke dashboard
                </Link>
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  )
}
