import { useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  Alert,
  AlertDialog,
  Avatar,
  Button,
  Chip,
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  Description,
  FieldError,
  Input,
  Label,
  Radio,
  RadioGroup,
  Switch,
  Tabs,
  TextField,
  toast,
} from "@heroui/react"

import { BrandImage } from "@/shared/components/brand-image"
import { defaultSettings, type AssetRef, type Settings } from "@/shared/config/defaults"
import { impactOf, moduleDefs, type ModuleDef } from "@/shared/config/modules"
import type { Profil } from "@/shared/data/master"
import { ApiError, assetRules, contrast, readAsset, saveSettings, textOn, themeVars, useSettings, type AssetKind, type FieldErrors } from "@/shared/data/settings"
import { cn } from "@/shared/lib/utils"
import { locale, tr } from "@/shared/lib/i18n"

type Section = "brand" | "theme" | "modules" | "data"
type Confirm = { title: string; body: string; action: string; onConfirm: () => void }

const sectionLabel: Record<Section, string> = { brand: "Branding", get theme() { return tr("Tema", "Theme") }, get modules() { return tr("Modul", "Modules") }, get data() { return tr("Profil data", "Data profile") } }
const ratio = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 1 })

export function SettingsPage() {
  const saved = useSettings()
  // Unsaved edits per tab. A tab with no entry shows what is saved.
  const [drafts, setDrafts] = useState<Partial<Pick<Settings, Section>>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<Section | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const value = <S extends Section>(s: S) => (drafts[s] ?? saved[s]) as Settings[S]
  const edit = <S extends Section>(s: S, next: Settings[S]) => setDrafts((d) => ({ ...d, [s]: next }))
  const changed = (s: Section) => drafts[s] !== undefined && JSON.stringify(drafts[s]) !== JSON.stringify(saved[s])
  const drop = (s: Section) =>
    setDrafts((d) => {
      const next = { ...d }
      delete next[s]
      return next
    })
  const discard = (s: Section) => {
    drop(s)
    setErrors({})
    setFailure(null)
  }

  const save = async (s: Section, next: Settings[Section] = value(s)) => {
    setPending(s)
    setErrors({})
    setFailure(null)
    try {
      await saveSettings({ ...saved, [s]: next })
      drop(s)
      toast.success(tr(`${sectionLabel[s]} tersimpan dan sudah berlaku.`, `${sectionLabel[s]} saved and in effect.`))
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields)
        setFailure(e.message)
      } else setFailure(tr("Pengaturan belum tersimpan. Coba lagi.", "Settings not saved. Try again."))
    } finally {
      setPending(null)
    }
  }

  const restore = (s: Section) =>
    setConfirm({
      title: tr(`Pulihkan ${sectionLabel[s]} ke bawaan?`, `Restore ${sectionLabel[s]} to defaults?`),
      body: tr(`Semua isian di tab ${sectionLabel[s]} kembali ke nilai bawaan template dan langsung tersimpan. Tab lain tidak berubah.`, `Every entry on the ${sectionLabel[s]} tab returns to the template default and is saved at once. Other tabs don't change.`),
      action: tr("Pulihkan", "Restore"),
      onConfirm: () => save(s, defaultSettings[s]),
    })

  const actions = (s: Section) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
      {/* Neutral, so it stays readable even when the chosen primary is not. */}
      <Button variant="tertiary" isDisabled={pending !== null} onPress={() => restore(s)}>
        {tr("Pulihkan ke bawaan", "Restore defaults")}
      </Button>
      <div className="flex gap-2">
        <Button variant="secondary" isDisabled={!changed(s) || pending !== null} onPress={() => discard(s)}>
          {tr("Batal", "Cancel")}
        </Button>
        <Button isPending={pending === s} isDisabled={!changed(s)} onPress={() => save(s)}>
          {tr("Simpan", "Save")}
        </Button>
      </div>
    </div>
  )

  const neverChanged = saved.updatedBy === defaultSettings.updatedBy
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-sm text-muted">
        {neverChanged
          ? tr("Belum pernah diubah. Semua nilai masih bawaan template.", "Never changed. Every value is still the template default.")
          : tr(`Terakhir disimpan ${new Date(saved.updatedAt).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })} oleh ${saved.updatedBy}.`, `Last saved ${new Date(saved.updatedAt).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })} by ${saved.updatedBy}.`)}
      </p>

      {failure && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{tr("Belum tersimpan", "Not saved")}</Alert.Title>
            <Alert.Description>{failure}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Tabs className="min-w-0">
        <Tabs.ListContainer>
          <Tabs.List aria-label={tr("Bagian pengaturan", "Settings sections")}>
            {(Object.keys(sectionLabel) as Section[]).map((s) => (
              <Tabs.Tab key={s} id={s} className="whitespace-nowrap">
                {sectionLabel[s]}
                {changed(s) && <span className="sr-only">{tr(" (belum disimpan)", " (not saved)")}</span>}
                {changed(s) && <span aria-hidden className="ml-1.5 size-1.5 rounded-full bg-warning" />}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="brand" className="flex flex-col gap-6 pt-6">
          <BrandTab brand={value("brand")} errors={errors} onError={(kind, message) => setErrors((e) => ({ ...e, [kind]: message }))} onChange={(next) => edit("brand", next)} />
          {actions("brand")}
        </Tabs.Panel>
        <Tabs.Panel id="theme" className="flex flex-col gap-6 pt-6">
          <ThemeTab theme={value("theme")} errors={errors} onChange={(next) => edit("theme", next)} />
          {actions("theme")}
        </Tabs.Panel>
        <Tabs.Panel id="modules" className="flex flex-col gap-6 pt-6">
          <ModulesTab modules={value("modules")} saved={saved.modules} onChange={(next) => edit("modules", next)} onConfirm={setConfirm} />
          {actions("modules")}
        </Tabs.Panel>
        <Tabs.Panel id="data" className="flex flex-col gap-6 pt-6">
          <DataTab data={value("data")} onChange={(next) => edit("data", next)} />
          {actions("data")}
        </Tabs.Panel>
      </Tabs>

      {/* HeroUI's alert dialog ignores Escape by default; here Escape means Batal. */}
      <AlertDialog.Backdrop isOpen={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)} isKeyboardDismissDisabled={false}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-md">
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>{confirm?.title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>{confirm?.body}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {tr("Batal", "Cancel")}
              </Button>
              <Button
                slot="close"
                variant="danger"
                onPress={() => {
                  confirm?.onConfirm()
                  setConfirm(null)
                }}
              >
                {confirm?.action}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  )
}

// ---- Branding ----

function BrandTab({
  brand,
  errors,
  onError,
  onChange,
}: {
  brand: Settings["brand"]
  errors: FieldErrors
  onError: (kind: AssetKind, message: string | undefined) => void
  onChange: (next: Settings["brand"]) => void
}) {
  const set = (patch: Partial<Settings["brand"]>) => onChange({ ...brand, ...patch })
  return (
    <>
      <TextField value={brand.appName} onChange={(appName) => set({ appName })} isInvalid={Boolean(errors.appName)} maxLength={40} className="max-w-md">
        <Label>{tr("Nama aplikasi", "App name")}</Label>
        <Input />
        <Description>
          {brand.appName.trim().length}/40 {tr("karakter. Tampil di judul tab browser, halaman masuk, sidebar, dan ringkasan PDF.", "characters. Shown in the browser tab title, sign-in page, sidebar and PDF summary.")}
        </Description>
        <FieldError>{errors.appName}</FieldError>
      </TextField>

      <AssetField
        kind="logo"
        label="Logo"
        usedIn={tr("Halaman masuk dan ringkasan PDF. Juga dipakai di sidebar bila ikon aplikasi kosong.", "Sign-in page and PDF summary. Also used in the sidebar when the app icon is empty.")}
        asset={brand.logo}
        error={errors.logo}
        onError={onError}
        onChange={(logo) => set({ logo })}
        preview={(a) => (
          <div className="grid h-40 w-40 place-items-center rounded-lg border border-border bg-surface p-3">
            <BrandImage asset={a} className="max-h-full max-w-full object-contain" fallback={<span className="text-center font-display text-sm">{brand.appName}</span>} />
          </div>
        )}
      />
      <AssetField
        kind="favicon"
        label="Favicon"
        usedIn={tr("Ikon di tab browser. Bila kosong, ikon aplikasi atau logo yang dipakai.", "Icon in the browser tab. When empty, the app icon or logo is used.")}
        asset={brand.favicon}
        error={errors.favicon}
        onError={onError}
        onChange={(favicon) => set({ favicon })}
        preview={(a) => (
          // Drawn the way a browser tab shows it, at 16 px beside the title.
          <div className="flex h-9 w-40 items-center gap-2 rounded-t-lg border border-b-0 border-border bg-surface px-3">
            <BrandImage asset={a ?? brand.appIcon ?? brand.logo} className="size-4 shrink-0 object-contain" fallback={<span className="size-4 shrink-0 rounded-sm bg-default" />} />
            <span className="truncate text-xs">{brand.appName}</span>
          </div>
        )}
      />
      <AssetField
        kind="appIcon"
        label={tr("Ikon aplikasi", "App icon")}
        usedIn={tr("Sidebar saat diciutkan dan ikon saat aplikasi disimpan ke layar utama perangkat.", "The collapsed sidebar, and the icon when the app is saved to a device home screen.")}
        asset={brand.appIcon}
        error={errors.appIcon}
        onError={onError}
        onChange={(appIcon) => set({ appIcon })}
        preview={(a) => (
          <div className="flex items-end gap-4">
            <BrandImage asset={a} className="size-14 rounded-2xl object-cover" fallback={<span className="grid size-14 place-items-center rounded-2xl bg-default text-xs text-muted">{tr("Kosong", "Empty")}</span>} />
            <BrandImage asset={a} className="size-5 object-contain" />
          </div>
        )}
      />
    </>
  )
}

function AssetField({
  kind,
  label,
  usedIn,
  asset,
  error,
  onError,
  onChange,
  preview,
}: {
  kind: AssetKind
  label: string
  usedIn: string
  asset: AssetRef | null
  error?: string
  onError: (kind: AssetKind, message: string | undefined) => void
  onChange: (asset: AssetRef | null) => void
  preview: (asset: AssetRef | null) => ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const id = `aset-${kind}`
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-hint`}
      className="grid gap-4 border-t border-border pt-6 sm:grid-cols-[10rem_minmax(0,1fr)]"
    >
      <div className="row-start-2 sm:row-start-1">{preview(asset)}</div>
      <div className="flex min-w-0 flex-col gap-1">
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {usedIn} {assetRules[kind].hint}
        </p>
        {asset && asset.size > 0 && (
          <p className="text-xs text-muted">
            Saat ini: {asset.mime.replace("image/", "").replace("svg+xml", "SVG").toUpperCase()}
            {asset.width ? `, ${asset.width} × ${asset.height} px` : ""}, {Math.ceil(asset.size / 1024)} KB
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={assetRules[kind].accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (!file) return
              setReading(true)
              try {
                onChange(await readAsset(kind, file))
                onError(kind, undefined)
              } catch (err) {
                onError(kind, (err as Error).message)
              } finally {
                setReading(false)
              }
            }}
          />
          <Button size="sm" variant="secondary" isPending={reading} onPress={() => input.current?.click()}>
            {asset ? `Ganti ${label.toLowerCase()}` : `Unggah ${label.toLowerCase()}`}
          </Button>
          {asset && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                onChange(null)
                onError(kind, undefined)
              }}
            >
              {tr("Hapus", "Remove")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Tema ----

/** HeroUI resolves its accent tokens at the root, so the preview sets them again on its own element. */
function previewVars(theme: Settings["theme"]) {
  const on = textOn(theme.primary)
  return {
    ...themeVars(theme),
    "--accent": theme.primary,
    "--accent-foreground": on,
    "--accent-hover": `color-mix(in oklab, ${theme.primary} 90%, ${on} 10%)`,
    "--accent-soft": `color-mix(in oklab, ${theme.primary} 15%, transparent)`,
    "--accent-soft-foreground": `color-mix(in oklab, ${theme.primary} 70%, var(--foreground) 30%)`,
    "--focus": theme.primary,
    "--link": theme.primary,
  } as CSSProperties
}

function ThemeTab({ theme, errors, onChange }: { theme: Settings["theme"]; errors: FieldErrors; onChange: (next: Settings["theme"]) => void }) {
  const onPrimary = contrast(theme.primary, textOn(theme.primary))
  const onSurface = contrast(theme.primary, "#FFFFFF")
  const onAccent = contrast(theme.accent, textOn(theme.accent))
  const warnings = [
    onPrimary < 4.5 && tr(`Teks di atas primary hanya ${ratio(onPrimary)} : 1. Label tombol utama sulit dibaca; minimal 4,5 : 1.`, `Text on primary is only ${ratio(onPrimary)} : 1. Main button labels are hard to read; at least 4.5 : 1.`),
    onSurface < 4.5 && tr(`Primary hanya ${ratio(onSurface)} : 1 di atas latar putih. Tautan dan garis fokus sulit terlihat; minimal 4,5 : 1.`, `Primary is only ${ratio(onSurface)} : 1 on white. Links and focus rings are hard to see; at least 4.5 : 1.`),
    onAccent < 4.5 && tr(`Inisial di atas accent hanya ${ratio(onAccent)} : 1; minimal 4,5 : 1.`, `Initials on accent are only ${ratio(onAccent)} : 1; at least 4.5 : 1.`),
  ].filter(Boolean) as string[]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <ColorRow
          label="Primary"
          usedIn={tr("Tombol utama, tautan, garis fokus, dan seri grafik. Turunannya (hover, latar tipis) dihitung otomatis.", "Main buttons, links, focus rings and chart series. Its variants (hover, tints) are derived automatically.")}
          value={theme.primary}
          error={errors.primary}
          onChange={(primary) => onChange({ ...theme, primary })}
        />
        <ColorRow
          label="Accent"
          usedIn={tr("Avatar pengguna dan tanda inisial aplikasi. Dipakai sedikit, supaya tetap menonjol.", "User avatars and the app's initials mark. Used sparingly so it stands out.")}
          value={theme.accent}
          error={errors.accent}
          onChange={(accent) => onChange({ ...theme, accent })}
        />
        {warnings.length > 0 && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{tr("Kontras kurang", "Low contrast")}</Alert.Title>
              <Alert.Description>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <span className="mt-1 block">{tr("Tetap bisa disimpan. “Pulihkan ke bawaan” selalu bisa dipakai bila hasilnya sulit dibaca.", "You can still save. “Restore defaults” is always there if the result is hard to read.")}</span>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </div>

      <section aria-labelledby="pratinjau-tema" style={previewVars(theme)} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <h3 id="pratinjau-tema" className="text-sm font-medium">
          {tr("Pratinjau", "Preview")}
        </h3>
        <p className="sr-only">{tr("Contoh tampilan dengan warna yang sedang dipilih. Tombolnya tidak bisa ditekan.", "A sample in the colors currently picked. Its buttons can't be pressed.")}</p>
        {/* Inert: sample controls, not a second Simpan. */}
        <div inert className="flex flex-wrap gap-2">
          <Button size="sm">{tr("Simpan", "Save")}</Button>
          <Button size="sm" variant="secondary">
            {tr("Batal", "Cancel")}
          </Button>
        </div>
        <p className="text-sm">
          {tr("Event baru di", "New event at")} <span className="text-link underline underline-offset-4">Gudang · Site Cikarang</span>
        </p>
        <div className="flex items-center gap-2">
          <Avatar size="sm">
            <Avatar.Fallback className="bg-brand-accent text-brand-accent-foreground">AL</Avatar.Fallback>
          </Avatar>
          <span className="text-sm">{tr("Avatar pengguna", "User avatar")}</span>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip size="sm" color="success">
              {tr("Aman", "Safe")}
            </Chip>
            <Chip size="sm" color="warning">
              {tr("Waspada", "Warning")}
            </Chip>
            <Chip size="sm" color="danger">
              {tr("Bahaya", "Danger")}
            </Chip>
          </div>
          <p className="text-xs text-muted">{tr("Warna status tetap, tidak ikut warna brand.", "Status colors stay fixed; they don't follow the brand colors.")}</p>
        </div>
      </section>
    </div>
  )
}

function ColorRow({ label, usedIn, value, error, onChange }: { label: string; usedIn: string; value: string; error?: string; onChange: (hex: string) => void }) {
  const hex = (c: { toString: (f: "hex") => string } | null) => c && onChange(c.toString("hex").toUpperCase())
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-3">
        <ColorPicker value={value} onChange={hex}>
          <ColorPicker.Trigger aria-label={tr(`Pilih warna ${label.toLowerCase()}`, `Pick the ${label.toLowerCase()} color`)} className="rounded-lg pointer-coarse:min-h-11">
            <ColorSwatch size="lg" />
          </ColorPicker.Trigger>
          <ColorPicker.Popover>
            <ColorArea aria-label={tr(`Area warna ${label.toLowerCase()}`, `${label} color area`)} className="max-w-full" colorSpace="hsb" xChannel="saturation" yChannel="brightness">
              <ColorArea.Thumb />
            </ColorArea>
            <ColorSlider channel="hue" className="gap-1 px-1" colorSpace="hsb">
              <Label>Hue</Label>
              <ColorSlider.Output className="text-muted" />
              <ColorSlider.Track>
                <ColorSlider.Thumb />
              </ColorSlider.Track>
            </ColorSlider>
          </ColorPicker.Popover>
        </ColorPicker>
        <ColorField value={value} onChange={hex} isInvalid={Boolean(error)} className="w-40">
          <Label>{label}</Label>
          <ColorField.Group>
            <ColorField.Input />
          </ColorField.Group>
          <FieldError>{error}</FieldError>
        </ColorField>
      </div>
      <p className="text-sm text-muted">{usedIn}</p>
    </div>
  )
}

// ---- Modul ----

function ModulesTab({
  modules,
  saved,
  onChange,
  onConfirm,
}: {
  modules: Settings["modules"]
  saved: Settings["modules"]
  onChange: (next: Settings["modules"]) => void
  onConfirm: (c: Confirm) => void
}) {
  const toggle = (m: ModuleDef, on: boolean) => {
    const next = { ...modules, [m.id]: on }
    if (on) return onChange(next)
    onConfirm({ title: tr(`Nonaktifkan ${m.menu.label}?`, `Turn off ${m.menu.label}?`), body: `${impactOf(m)} ${tr("Berlaku untuk semua pengguna setelah Simpan.", "Applies to every user after Save.")}`, action: tr("Nonaktifkan", "Turn off"), onConfirm: () => onChange(next) })
  }
  const noneOn = moduleDefs.every((m) => !modules[m.id])
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{tr("Login, pengguna, master data, dan Pengaturan termasuk core dan selalu aktif.", "Sign-in, users, master data and Settings are core and always on.")}</p>
      {noneOn && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{tr("Semua modul dimatikan", "Every module is off")}</Alert.Title>
            <Alert.Description>{tr("Setelah disimpan, pengguna hanya melihat “Belum ada modul aktif”. Super Admin tetap bisa membuka Pengaturan.", "After saving, users only see “No module is active”. Super Admin can still open Settings.")}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {moduleDefs.map((m) => {
          const Icon = m.menu.icon
          const pendingChange = modules[m.id] !== saved[m.id]
          return (
            <li key={m.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <Icon className={cn("size-4.5 shrink-0", modules[m.id] ? "text-foreground" : "text-muted")} strokeWidth={1.5} aria-hidden />
              {/* The control sits inside Content, the switch's <label>, so the whole row toggles it. */}
              <Switch isSelected={modules[m.id]} onChange={(on) => toggle(m, on)} className="min-w-0 flex-1">
                <Switch.Content className="w-full cursor-pointer flex-row-reverse items-center justify-between gap-3">
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <Label className="cursor-pointer">{m.menu.label}</Label>
                    <Description>
                      {pendingChange ? (modules[m.id] ? tr("Aktif setelah disimpan.", "On after saving.") : tr("Nonaktif setelah disimpan.", "Off after saving.")) : modules[m.id] ? tr("Aktif", "On") : tr("Nonaktif", "Off")}
                    </Description>
                  </span>
                </Switch.Content>
              </Switch>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---- Profil data ----

const profilOptions: { id: Profil; label: string; description: string }[] = [
  {
    id: "pabrik",
    get label() { return tr("Pabrik / industri", "Factory / industrial") },
    get description() { return tr("Tiga site industri dengan uplink fiber, satu server analitik per site, sensor lingkungan di dalam gedung.", "Three industrial sites on fibre uplinks, one analytics server per site, indoor environment sensors.") },
  },
  {
    id: "tambang",
    get label() { return tr("Pertambangan", "Mining") },
    get description() { return tr("Tambang Berau dengan link Starlink, Aegis Intelligence Pole, dan Manpack patroli peledakan, plus site prosesing & terminal Cilegon.", "The Berau mine on Starlink with Aegis Intelligence Poles and a blasting-patrol Manpack, plus the Cilegon processing and terminal site.") },
  },
]

function DataTab({ data, onChange }: { data: Settings["data"]; onChange: (next: Settings["data"]) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted">
        {tr(
          "Menentukan data contoh yang dimuat: site, zona, kamera, sensor, perangkat, dan pengguna. Berguna untuk demo ke jenis klien yang berbeda. Pilihan ini hilang begitu data diambil dari API sungguhan.",
          "Sets which sample data is loaded: sites, zones, cameras, sensors, devices and users. Useful for demos to different kinds of client. This choice goes away once data comes from a real API.",
        )}
      </p>
      <RadioGroup value={data.profil} onChange={(profil) => onChange({ profil: profil as Profil })}>
        <Label>{tr("Profil data contoh", "Sample data profile")}</Label>
        {profilOptions.map((p) => (
          <Radio key={p.id} value={p.id}>
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <span className="flex flex-col">
                <span>{p.label}</span>
                <Description>{p.description}</Description>
              </span>
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>
      <p className="text-sm text-muted">{tr("Setelah disimpan, filter site kembali ke site pertama profil itu. Perubahan master data di profil lain tetap ada sampai halaman dimuat ulang.", "After saving, the site filter returns to that profile's first site. Master data edits in the other profile stay until reload.")}</p>
    </div>
  )
}
