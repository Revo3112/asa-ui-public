// #region import
import { EventFeed } from "@/features/events/components/event-feed"
import { useFilters } from "@/shared/components/filter-bar"
// #endregion
import { Code, CodeBlock, Example, Props, Section, snippet } from "@/features/storybook/stories/doc"
import source from "./event-feed.tsx?raw"

// #region feed
function LatestEvents() {
  const { key } = useFilters()
  return <EventFeed key={key} className="max-w-xl" />
}
// #endregion

export function EventFeedStory() {
  return (
    <>
      <p className="max-w-prose text-lg text-muted">
        Sepuluh event terakhir dengan foto bukti, zona, sumber, umur, dan severity. Event baru dari socket masuk di atas tanpa memuat ulang. Pilih satu untuk membuka drawer detail.
      </p>
      <Section title="Import">
        <CodeBlock code={snippet(source, "import")} />
      </Section>
      <Example
        title="Feed langsung"
        description="Feed membaca filter dari URL sendiri. Pasang key dari useFilters supaya ganti filter memulai aliran baru, bukan mencampur event lama dan baru."
        code={snippet(source, "feed")}
      >
        <LatestEvents />
      </Example>
      <Props rows={[["className?", "string", "Kelas tambahan untuk kartu Widget, misalnya lebar atau span grid."]]} />
      <Section title="Catatan">
        <p className="max-w-prose">
          Data dummy belum punya foto bukti, jadi thumbnail menampilkan placeholder. Setelah API mengirim <Code>bukti</Code>, foto tampil tanpa mengubah komponen.
        </p>
      </Section>
    </>
  )
}
