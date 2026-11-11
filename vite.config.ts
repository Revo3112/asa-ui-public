import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from "path";
import { cpSync, existsSync, mkdirSync } from "node:fs"
import { publicCctvStreams } from "./src/shared/config/cctv-demo-media.js"

const projectRoot = import.meta.dirname
const publicCctvFiles = new Set(publicCctvStreams.map((url) => path.resolve(projectRoot, "public", decodeURIComponent(url.slice(1)))))
const publicRoot = path.resolve(projectRoot, "public")
const cctvSource = path.resolve(publicRoot, "CCTV")
const buildRoot = path.resolve(projectRoot, "dist")

const copyCuratedPublicFiles = {
  name: "copy-curated-public-files",
  apply: "build" as const,
  buildStart() {
    const missing = [...publicCctvFiles].filter((source) => !existsSync(source))
    if (missing.length) throw new Error(`Missing curated CCTV file(s): ${missing.map((source) => path.relative(publicRoot, source)).join(", ")}`)
  },
  closeBundle() {
    mkdirSync(buildRoot, { recursive: true })
    cpSync(publicRoot, buildRoot, {
      recursive: true,
      filter(source) {
        const absolute = path.resolve(source)
        if (absolute === cctvSource) return true
        if (absolute.startsWith(`${cctvSource}${path.sep}`)) {
          return publicCctvFiles.has(absolute) || [...publicCctvFiles].some((file) => file.startsWith(`${absolute}${path.sep}`))
        }
        return true
      },
    })
  },
}


// https://vite.dev/config/
export default defineConfig({
  resolve: { alias: { "@": path.resolve(projectRoot, "src") } },
  build: {
    // Keep the large unselected video library in public/CCTV out of production output.
    copyPublicDir: false,
    rolldownOptions: {
      output: {
        // Libraries in their own chunks: they change less often than the app, so browsers keep them cached.
        codeSplitting: {
          groups: [
            { name: "charts", test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|uplot)[\\/]/ },
            { name: "ui", test: /node_modules[\\/](@heroui|@react-aria|react-aria|react-aria-components|@react-stately|react-stately|@internationalized|@react-types|tailwind-variants)/ },
            { name: "video", test: /node_modules[\\/](@videojs|video\.js|media-chrome)/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
    copyCuratedPublicFiles,
  ],
})
