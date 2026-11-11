import { useEffect, useState } from "react"
import { Alert, Button, Card, FieldError, Form, Input, Label, TextField } from "@heroui/react"
import { Navigate, useNavigate, useSearchParams } from "react-router"

import { BrandImage } from "@/shared/components/brand-image"
// import { master } from "@/shared/data/master"
import { getSession, login } from "@/shared/auth/session"
import { loadSettings, useSettings } from "@/shared/data/settings"
import { tr } from "@/shared/lib/i18n"

/** Only paths inside the app, so `?next=` can't send the user to another site. */
const safeNext = (next: string | null) => (next?.startsWith("/") && !next.startsWith("//") ? next : "/")

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const next = safeNext(params.get("next"))
  const { brand } = useSettings()
  useEffect(() => {
    loadSettings("public")
  }, [])

  if (getSession()) return <Navigate to={next} replace />

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <Card>
        <Card.Header className="items-center text-center">
          {/* Without a logo the heading carries the app name alone. */}
          <BrandImage asset={brand.logo} className="mb-5 h-16 max-w-48 object-contain" />
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Masuk ke {brand.appName}</h1>
          <Card.Description className="mt-2">{tr("Masukkan email dan kata sandi akun Anda.", "Enter your account email and password.")}</Card.Description>
        </Card.Header>

        <Card.Content className="flex flex-col gap-4">
          {params.get("alasan") === "sesi-habis" && !error && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{tr("Sesi Anda sudah berakhir", "Your session has ended")}</Alert.Title>
                <Alert.Description>{tr("Tidak ada aktivitas terlalu lama. Masuk lagi untuk melanjutkan.", "No activity for too long. Sign in again to continue.")}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {error && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{tr("Belum bisa masuk", "Could not sign in")}</Alert.Title>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <Form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setIsPending(true)
              setError(null)
              try {
                // ponytail: mock check against master users. Call the auth endpoint here.
                await login(email, password)
                navigate(next, { replace: true })
              } catch (err) {
                setError((err as Error).message)
                setIsPending(false)
              }
            }}
          >
            <TextField isRequired name="email" type="email" autoComplete="email" value={email} onChange={setEmail}>
              <Label>Email</Label>
              <Input placeholder="nama@perusahaan.co.id" />
              <FieldError>{({ validationDetails }) => (validationDetails.valueMissing ? tr("Email wajib diisi.", "Email is required.") : tr("Format email belum benar.", "The email format is not right."))}</FieldError>
            </TextField>
            <TextField isRequired name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword}>
              <Label>{tr("Kata sandi", "Password")}</Label>
              <Input placeholder="••••••••" />
              <FieldError>{tr("Kata sandi wajib diisi.", "Password is required.")}</FieldError>
            </TextField>
            <Button type="submit" variant="primary" fullWidth className="mt-1" isPending={isPending}>
              {tr("Masuk", "Sign in")}
            </Button>
          </Form>
        </Card.Content>
      </Card>

      {/* <Card variant="secondary">
        <Card.Header>
          <Card.Title>Akun demo</Card.Title>
          <Card.Description>
            Kata sandi semua akun: <code>{DEMO_PASSWORD}</code>. Pilih satu untuk mengisi form.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <ul className="flex flex-col gap-1">
            {master()
              .pengguna.filter((u) => u.aktif)
              .map((u) => (
                <li key={u.id}>
                  <Button
                    variant="ghost"
                    fullWidth
                    className="h-auto justify-between py-2 text-left"
                    onPress={() => {
                      setEmail(u.email)
                      setPassword(DEMO_PASSWORD)
                    }}
                  >
                    <span className="min-w-0 truncate">{u.email}</span>
                    <span className="shrink-0 text-muted">{roleLabel[u.role]}</span>
                  </Button>
                </li>
              ))}
          </ul>
        </Card.Content>
      </Card> */}
    </div>
  )
}
