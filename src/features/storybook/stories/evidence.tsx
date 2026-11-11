// #region import
import { Evidence, EvidenceViewer } from "@/features/events/components/event-drawer"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./evidence.tsx?raw"

// #region viewer
function ViolationFrame() {
  return (
    <div className="max-w-2xl">
      <EvidenceViewer alt="Bukti tanpa helm, CAM-03" box={{ x: 38, y: 14, w: 20, h: 72 }} label="Tanpa helm" />
    </div>
  )
}
// #endregion

// #region thumb
function Thumbnail() {
  return <Evidence alt="Bukti tanpa rompi, CAM-01" className="size-12 rounded-md" />
}
// #endregion

export function EvidenceStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Frame bukti dari kamera dengan kotak orang yang terdeteksi dan labelnya. Dipakai drawer detail untuk event PPE, dan versi kecilnya jadi thumbnail di feed.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Dengan bounding box"
        description="Posisi kotak dalam persen gambar, sama seperti yang dikirim model AI, jadi tetap pas di ukuran layar mana pun. Data dummy belum punya foto, jadi frame menampilkan placeholder."
        code={snippet(source, "viewer")}
      >
        <ViolationFrame />
      </Example>
      <Example title="Thumbnail" description="Evidence tanpa kotak, ukurannya diatur lewat className." code={snippet(source, "thumb")}>
        <Thumbnail />
      </Example>
      <Props
        title="Props EvidenceViewer"
        rows={[
          ["src?", "string", "URL frame bukti. Kosong: placeholder dengan ikon gambar tidak tersedia."],
          ["alt", "string", "Teks alternatif: pelanggaran dan kamera."],
          ["box?", "{ x, y, w, h }", "Kotak orang dalam persen lebar dan tinggi gambar."],
          ["label", "string", "Teks di pojok kotak, biasanya judul pelanggaran."],
        ]}
      />
      <Section title="Catatan">
        <p className="max-w-prose">
          Frame selalu 16:9 dan memakai <Code>object-cover</Code>. Kalau kamera site memakai rasio lain, sesuaikan rasio di EvidenceViewer supaya kotak tidak bergeser.
        </p>
      </Section>
    </>
  )
}
