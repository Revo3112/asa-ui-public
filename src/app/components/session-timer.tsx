import { useEffect } from "react"
import { Button, Modal } from "@heroui/react"

import { session as sessionConfig } from "@/shared/config/app"
import { extendSession, logout, sessionEndsAt } from "@/shared/auth/session"
import { useNow } from "@/shared/lib/time"
import { tr } from "@/shared/lib/i18n"

/** Activity extends the session at most this often. */
const EXTEND_EVERY_MS = 30_000

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Ends an idle session. Clicks and key presses push the end back; a minute before it,
 * a dialog asks to extend, and from then on only its button does.
 */
export function SessionTimer() {
  const now = useNow(1000)
  const left = sessionEndsAt() - now
  const warnMs = sessionConfig.warnSeconds * 1000
  const isWarning = left <= warnMs

  useEffect(() => {
    let last = 0
    const onActivity = () => {
      // Once the warning shows, only its button extends the session.
      if (sessionEndsAt() - Date.now() <= warnMs || Date.now() - last < EXTEND_EVERY_MS) return
      last = Date.now()
      extendSession()
    }
    window.addEventListener("pointerdown", onActivity)
    window.addEventListener("keydown", onActivity)
    return () => {
      window.removeEventListener("pointerdown", onActivity)
      window.removeEventListener("keydown", onActivity)
    }
  }, [warnMs])

  const expired = left <= 0
  // The dashboard layout sends a signed-out user to the login page.
  useEffect(() => {
    if (expired) logout("sesi-habis")
  }, [expired])

  return (
    <Modal.Backdrop isOpen={isWarning && !expired} isDismissable={false} isKeyboardDismissDisabled>
      <Modal.Container size="sm">
        <Modal.Dialog role="alertdialog">
          <Modal.Header>
            <Modal.Heading>{tr("Sesi Anda segera berakhir", "Your session is about to end")}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p>
              {tr("Karena tidak ada aktivitas, sesi berakhir dalam", "Because there has been no activity, your session ends in")} <span className="font-medium tabular-nums">{mmss(left)}</span>{tr(". Isian yang belum disimpan akan hilang.", ". Unsaved entries will be lost.")}
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onPress={() => logout()}>
              {tr("Keluar", "Sign out")}
            </Button>
            <Button onPress={extendSession}>{tr("Perpanjang sesi", "Extend session")}</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
