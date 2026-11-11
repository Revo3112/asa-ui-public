import { Link } from "react-router"

import { CodeBlock, Code, Section } from "@/features/storybook/stories/doc"
import { groups, stories } from "@/features/storybook/stories/registry"
import source from "../examples/contoh.tsx?raw"

export function StorybookIndex() {
  return (
    <>
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-bold! tracking-tight lg:text-5xl">Katalog komponen</h1>
        <p className="max-w-prose text-lg text-muted">
          Semua komponen reusable template HSE dalam satu tempat, masing-masing dengan contoh hidup dan kode yang merendernya. Contoh memakai data dummy yang sama dengan dashboard, jadi filter, status, dan
          aksi benar-benar berjalan.
        </p>
      </div>

      <Section title="Daftar komponen">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <h3 className="text-sm text-muted">{group}</h3>
              <ul className="flex flex-col">
                {stories
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <li key={s.slug}>
                      <Link to={`/storybook/${s.slug}`} className="flex min-h-9 items-center text-link underline-offset-4 hover:underline pointer-coarse:min-h-11">
                        {s.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Menambah komponen">
        <ol className="flex max-w-prose list-decimal flex-col gap-2 pl-5">
          <li>
            Buat file story di <Code>src/features/storybook/stories/</Code>. Bungkus import dan tiap contoh dengan <Code>// #region nama</Code> dan <Code>// #endregion</Code>, lalu impor file itu sendiri
            dengan <Code>?raw</Code>. Kode yang tampil di halaman diambil dari region itu, jadi selalu sama dengan yang dirender.
          </li>
          <li>
            Tambahkan satu entri di <Code>src/features/storybook/stories/registry.ts</Code>. Sidebar, route, breadcrumb, dan tombol sebelum dan sesudahnya ikut dari situ.
          </li>
        </ol>
        <CodeBlock code={source} />
      </Section>
    </>
  )
}
