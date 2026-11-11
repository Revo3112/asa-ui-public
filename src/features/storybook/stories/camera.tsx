// #region import
import { useState } from "react"
import { Skeleton } from "@heroui/react"

import { CameraTile } from "@/features/cctv/components/camera-tile"
import { useFilters } from "@/shared/components/filter-bar"
import { useWidgetData, WidgetBody } from "@/shared/components/widget"
import type { Violation } from "@/features/ppe/data/apd"
import { getCameras, toCamera } from "@/features/cctv/data/cctv"
import { master } from "@/shared/data/master"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./camera.tsx?raw"

// #region states
function TileStates() {
  const [online, offline, alerted] = master().kamera.filter((k) => k.aktif).map(toCamera)
  const [offlineSince] = useState(() => new Date(Date.now() - 25 * 60_000))
  const [alert, setAlert] = useState<Violation | undefined>(() => ({
    id: "CONTOH-1",
    apd: ["helm"],
    site: alerted.site,
    zona: alerted.zona,
    kamera: alerted.id,
    shift: "pagi",
    waktu: new Date(),
    status: "open",
    box: { x: 40, y: 15, w: 20, h: 70 },
  }))
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <CameraTile camera={online} onDismissAlert={() => {}} />
      <CameraTile camera={offline} status={{ online: false, since: offlineSince }} onDismissAlert={() => {}} />
      <CameraTile camera={alerted} alert={alert} onDismissAlert={() => setAlert(undefined)} />
    </div>
  )
}
// #endregion

// #region grid
function CameraGrid() {
  const { filters, key } = useFilters()
  const query = useWidgetData(() => getCameras(filters), key)
  return (
    <WidgetBody
      query={query}
      skeleton={
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      }
      isEmpty={(list) => list.cameras.length === 0}
      empty="Belum ada kamera aktif di site ini."
    >
      {({ cameras, status }) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {cameras.slice(0, 4).map((camera) => (
            <CameraTile key={camera.id} camera={camera} status={status[camera.id]} onDismissAlert={() => {}} />
          ))}
        </div>
      )}
    </WidgetBody>
  )
}
// #endregion

export function CameraStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Satu tile per kamera: siaran langsung, nama, titik status, dan sorotan saat ada pelanggaran. Grid kamera adalah CSS grid biasa berisi tile, jadi jumlah kolom diatur halaman.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Status tile"
        description="Online, offline dari server, dan sorotan pelanggaran. Tombol silang menutup sorotan; Coba sambung ulang memaksa membuka stream walau server bilang offline. Pelanggaran di contoh ini dibuat untuk demo."
        code={snippet(source, "states")}
      >
        <TileStates />
      </Example>
      <Example
        title="Grid 2×2"
        description="Kamera dari data dummy site aktif. Halaman Monitor CCTV memakai pola yang sama dengan pilihan 1, 4, 9, atau 16 tile."
        code={snippet(source, "grid")}
      >
        <CameraGrid />
      </Example>
      <Props
        title="Props CameraTile"
        rows={[
          ["camera", "Camera", "Kamera dari master data: id, label, zona, URL stream, dan tipe stream."],
          ["status?", "{ online, since }", "Status dari server. online: false menampilkan Offline dan kapan terakhir online."],
          ["alert?", "Violation", "Pelanggaran yang disorot: bingkai berwarna severity dan chip di bawah."],
          ["fill?", "boolean", "Isi sel grid alih-alih 16:9, untuk mode layar penuh."],
          ["onOpen?", "() => void", "Membuat seluruh tile bisa diklik, misalnya untuk membuka detail kamera."],
          ["onDismissAlert", "() => void", "Dipanggil tombol silang pada sorotan."],
        ]}
      />
      <Section title="Catatan">
        <p className="max-w-prose">
          Tile hanya memutar video saat dekat layar dan menyambung ulang sendiri dengan jeda 2 detik yang berlipat sampai 1 menit. Stream contoh berupa MP4 di <Code>public/mock/cctv</Code>; HLS
          juga didukung lewat <Code>streamType</Code>.
        </p>
      </Section>
    </>
  )
}
