# Template Frontend Dashboard HSE

Titik awal setiap project dashboard HSE PT Asa Kreasi Interasia (PPE, ERT, lingkungan kerja), sekarang dengan lapisan keputusan di atas deteksi AI: indikasi → review → kasus → tindakan korektif → verifikasi, plus analisis risiko dan AI Assistant. Login, tabel, layout, dan komponen sudah jadi, jadi tim cukup menyambungkan API dan model AI.

Modul yang tersedia: Core, Overview (Ringkasan), Pusat Keputusan, Indikasi AI, Kasus, Tindakan Korektif, Rekomendasi, Kesehatan Perangkat, AI Assistant, Analisis Risiko, Kualitas Deteksi, PPE, Zona Terlarang, CCTV, Lingkungan (dasar), Event & Laporan, ERT (dasar), dan Panduan Demo. Dua profil data contoh: pabrik dan pertambangan (bagian 15).

Stack: Vite 8, React 19, TypeScript, HeroUI v3, Tailwind CSS v4, React Router, Recharts, Video.js 10, jsPDF. Semua data masih dummy dan dibuat di browser.

## 1. Mulai cepat

Prasyarat:

- Node.js `^20.19.0` atau `>=22.12.0` (syarat Vite 8, lihat `engines` di `node_modules/vite/package.json`).
- npm (repo memakai `package-lock.json`).

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Skrip `dev` memakai `vite --host`, jadi aplikasi juga bisa dibuka dari perangkat lain di jaringan yang sama.

Akun demo diambil dari data master di [src/shared/data/master.ts](src/shared/data/master.ts). Semua akun memakai kata sandi `demo123` (`DEMO_PASSWORD` di [src/shared/auth/session.ts](src/shared/auth/session.ts)). Halaman login juga menampilkan daftar ini dan bisa mengisi form dengan satu klik.

| Role | Email | Akses site (profil pabrik) | Akses site (profil tambang) |
|---|---|---|---|
| Super Admin | `ayu@example.com` | Semua site | Semua site |
| Admin Site | `bagus@example.com` | Cikarang | Cilegon |
| Admin Site | `sari@example.com` | Karawang, Balikpapan | Berau |
| HSE Officer | `rina@example.com` | Cikarang, Karawang | Semua site |
| HSE Officer | `dimas@example.com` | Balikpapan | Berau |
| Viewer | `yosef@example.com` | Cikarang | Cilegon |
| Site Manager | `lukman@example.com` | Semua site | Semua site |
| HSE Manager | `maya@example.com` | Semua site | Semua site |
| Operator Control Room | `oki@example.com` | Semua site | Semua site |
| Area Supervisor | `taufik@example.com`, `rizal@example.com` | Semua site | Semua site |
| IT/OT Admin | `wulan@example.com` | Semua site | Semua site |

`hendra@example.com` (Viewer) sengaja dinonaktifkan untuk menunjukkan pesan akun nonaktif. Hak tiap role di alur review ada di bagian 8 dan di halaman Panduan Demo (`/panduan`).

## 2. Mock API dan data dummy

Fungsi data fitur ada di `src/features/*/data/`, sedangkan store dan helper lintas fitur ada di `src/shared/data/`. Setiap fungsi mock mewakili satu panggilan API, jadi saat backend siap fungsi domainnya bisa diganti dengan `fetch()`.

| File | Isi |
|---|---|
| [src/shared/data/master.ts](src/shared/data/master.ts) | Zona, site, kamera, sensor, shift, pengguna. Disimpan di memori, kembali ke awal saat halaman dimuat ulang |
| [src/shared/data/filters.ts](src/shared/data/filters.ts) | Tipe filter, pilihan filter global, nilai filter awal, dan rentang periode |
| [src/shared/data/mock-api.ts](src/shared/data/mock-api.ts) | Generator data deterministik dan simulasi respons API untuk mock |
| [src/features/overview/data/overview.ts](src/features/overview/data/overview.ts) | Agregat halaman Overview, tren mingguan, zona paling rawan, dan ringkasan APD |
| [src/features/ppe/data/apd.ts](src/features/ppe/data/apd.ts) | Pelanggaran APD, kepatuhan, heatmap |
| [src/features/cctv/data/cctv.ts](src/features/cctv/data/cctv.ts) | Daftar kamera dan status online/offline |
| [src/features/environment/data/lingkungan.ts](src/features/environment/data/lingkungan.ts) | Sensor, ambang batas, pembacaan live dan riwayat |
| [src/features/ert/data/ert.ts](src/features/ert/data/ert.ts) | Personel siaga dan peralatan darurat |
| [src/features/events/data/events.ts](src/features/events/data/events.ts) | Model event tunggal untuk Overview, APD, CCTV, dan Event & Laporan |
| [src/shared/data/settings.ts](src/shared/data/settings.ts) | Pengaturan branding, tema, dan modul |
| [src/shared/auth/session.ts](src/shared/auth/session.ts) | Login, role, site aktif, timeout sesi |
| [src/shared/data/seed/pabrik.ts](src/shared/data/seed/pabrik.ts), [src/shared/data/seed/tambang.ts](src/shared/data/seed/tambang.ts) | Master data per profil: site, zona (dengan risiko bawaan), kamera, sensor, shift, pengguna, perangkat |
| [src/shared/data/skenario.ts](src/shared/data/skenario.ts) | Cerita demo per profil, relatif ke waktu halaman dimuat: gangguan, telemetri, indikasi yang ditempatkan manual |
| [src/features/indications/data/indikasi.ts](src/features/indications/data/indikasi.ts) | Indikasi AI dan temuan review, plus alur acknowledge → review |
| [src/features/cases/data/kasus.ts](src/features/cases/data/kasus.ts), [src/features/cases/data/kasus-seed.ts](src/features/cases/data/kasus-seed.ts) | Kasus dan tindakan korektif, plus alurnya (verifikasi oleh selain PIC) |
| [src/features/devices/data/sumber.ts](src/features/devices/data/sumber.ts) | Status sumber (kamera, uplink, server edge, Aegis Pole, Manpack), riwayat gangguan, seri uplink/baterai, jeda sinkron |
| [src/shared/data/audit.ts](src/shared/data/audit.ts) | Jejak audit append-only per record dan timeline sesi |
| [src/features/decisions/data/keputusan.ts](src/features/decisions/data/keputusan.ts) | Agregat Pusat Keputusan: KPI, kartu site, kartu keputusan, antrean prioritas |
| [src/features/analysis/data/analisis.ts](src/features/analysis/data/analisis.ts) | Skor risiko zona, anomali, tren, fakta brief, brief ID/EN, jawaban Tanya Asisten |
| [src/features/quality/data/kualitas.ts](src/features/quality/data/kualitas.ts) | Mutu review: komposisi outcome, skor detektor, SLA per shift, backlog review |
| [src/features/assistant/data/asisten.ts](src/features/assistant/data/asisten.ts) | Jawaban halaman AI Assistant (mock, tanpa LLM) |
| [src/shared/config/cctv-demo-media.ts](src/shared/config/cctv-demo-media.ts) | Pilihan klip demo CCTV untuk profil pabrik |

Profil pabrik memakai variasi klip dari [public/CCTV/](public/CCTV/) yang dipetakan per area kamera, termasuk konstruksi dan area industri. Klip pengiriman memakai resolusi lebih tinggi saat detail dibuka. `LPR sample.mp4` adalah sumber 282 MB; aplikasi memakai dua turunan 12 detik (`lpr-grid.mp4` dan `lpr-hd.mp4`) agar versi grid ringan dan detail tetap jelas. Build produksi hanya menyalin klip yang dipakai; sumber lain tetap lokal dan diabaikan Git. Profil tambang tetap memakai klip mock generik karena folder sumber tidak berisi rekaman tambang yang cocok.

Mock tidak bisa dimatikan lewat variabel env. Mock adalah isi fungsi itu sendiri, jadi mematikannya berarti mengganti isi fungsi (lihat bagian 4). `TODO: tentukan apakah perlu satu flag env untuk berpindah antara mock dan API asli.`

### Skenario

| Skenario | Cara memicu |
|---|---|
| Loading tanpa akhir | Tambah `?demo=loading` di URL halaman mana pun |
| Data kosong | `?demo=empty` |
| Error | `?demo=error` |
| Sensor berhenti mengirim | Otomatis. Sensor `debu-cikarang-gudang` diam 45 detik setiap 5 menit |
| Kamera offline | Otomatis. CAM-07 dan CAM-14 offline sejak awal, lalu satu kamera berganti status setiap 40 detik (maksimal tiga offline sekaligus) |
| Stream gagal diputar | CAM-11 dilaporkan online, tetapi URL-nya menunjuk file yang tidak ada |

Selama `?demo=` aktif, semua stream live berhenti. Katalog komponen punya pemilih untuk parameter ini di `/storybook/state`. Skenario respons lambat belum ada; semua mock menjawab dalam 300 sampai 800 ms.

### Generator WebSocket mock

Belum ada WebSocket sungguhan. Setiap fungsi `subscribe*` memakai timer dan mengembalikan fungsi unsubscribe, persis seperti nanti dengan `new WebSocket(url)`. PPE dan alarm lingkungan memakai satu timer bersama ([src/shared/lib/ticker.ts](src/shared/lib/ticker.ts)), jadi lonceng notifikasi dan halaman menerima event yang sama.

| Topik | Fungsi | Perilaku mock |
|---|---|---|
| `ppe.violation` | `subscribeViolations` di [src/features/ppe/data/apd.ts](src/features/ppe/data/apd.ts) | Satu pelanggaran baru setiap 20 detik di salah satu site milik pengguna |
| `environment.alarm` | `subscribeEvents` di [src/features/events/data/events.ts](src/features/events/data/events.ts) | Satu alarm lingkungan sekitar setiap 45 detik |
| `environment.reading` | `subscribeReadings` di [src/features/environment/data/lingkungan.ts](src/features/environment/data/lingkungan.ts) | Satu nilai per sensor per detik. Nilai berjalan acak dan kadang melonjak melewati ambang |
| `camera.status` | `subscribeCameraStatus` di [src/features/cctv/data/cctv.ts](src/features/cctv/data/cctv.ts) | Satu kamera berganti online/offline setiap 40 detik |

Setiap stream hanya berjalan selama modul pemiliknya aktif (`topicOn()` di [src/shared/config/modules.ts](src/shared/config/modules.ts)).

## 3. Ganti branding dan aktifkan modul

Semua dilakukan dari halaman Pengaturan, tanpa build ulang dan tanpa mengubah kode komponen. Hanya Super Admin yang bisa membukanya; role lain mendapat halaman 403.

1. Login sebagai Super Admin, buka Administrasi → Pengaturan (`/admin/pengaturan`).
2. Tab Branding: isi nama aplikasi (maksimal 40 karakter) dan unggah gambar.
   - Logo: SVG atau PNG, maksimal 512 × 512 px dan 1 MB. Logo SVG maksimal rasio 4 : 1.
   - Favicon: PNG atau ICO persegi, maksimal 256 KB.
   - Ikon aplikasi: PNG persegi, maksimal 512 × 512 px dan 1 MB.
3. Tab Tema: pilih warna primary dan accent. Jika kontras teks di bawah 4,5 : 1, halaman menampilkan peringatan. Penyimpanan tetap bisa dilakukan.
4. Tab Modul: nyalakan atau matikan modul. Tab Profil data: pilih data contoh pabrik atau pertambangan (bagian 15). Sebelum modul dimatikan, dialog konfirmasi menyebut apa saja yang ikut hilang. Core (login, pengguna, master data, Pengaturan) selalu aktif.
5. Klik Simpan di tab itu. Setiap tab disimpan sendiri. Tema, judul tab browser, favicon, sidebar, dan menu langsung berubah tanpa memuat ulang.
6. Pulihkan ke bawaan mengembalikan satu tab ke nilai bawaan dan langsung menyimpannya. Tab lain tidak berubah.

Nilai bawaan ada di [src/shared/config/defaults.ts](src/shared/config/defaults.ts) (`defaultSettings`). Aplikasi memakai nilai ini jika API pengaturan gagal dan tidak ada cache di browser. Urutannya: cache localStorage dipakai sebelum render pertama, lalu diganti jawaban API begitu tiba.

Efek mematikan modul (semuanya diturunkan dari registry di [src/shared/config/modules.ts](src/shared/config/modules.ts)):

- Menu hilang dari sidebar, dan alamatnya menampilkan 404. Pengguna yang sedang membuka halaman itu dialihkan ke halaman awal.
- Kartu KPI modul itu hilang dari Overview.
- Tipe event modul itu hilang dari filter dan notifikasi.
- Langganan WebSocket modul itu berhenti.
- Data dan komponennya tidak dihapus.

Jika Overview dimatikan, `/` diteruskan ke modul aktif pertama. Jika semua modul mati, pengguna melihat halaman "Belum ada modul aktif".

Selama belum tersambung backend, pengaturan disimpan di localStorage browser (kunci `hse-settings-db` sebagai server tiruan, `hse-settings` sebagai cache). Setiap browser punya salinannya sendiri, dan gambar disimpan sebagai data URL.

Warna status (aman, waspada, bahaya) dan severity tidak ikut warna brand. Nilainya tetap di [src/app/index.css](src/app/index.css).

Preset di katalog komponen dan di [src/shared/config/defaults.ts](src/shared/config/defaults.ts): **Bawaan** (pabrik, semua modul), **Klien contoh** (tanpa CCTV, ERT, dan lapisan keputusan), dan **Pertambangan** (profil tambang, Ringkasan dan CCTV live mati sehingga halaman awal adalah Pusat Keputusan).

Katalog tidak diatur dari Pengaturan, tetapi langsung di file:

| Katalog | File |
|---|---|
| Jenis APD, target kepatuhan | [src/shared/config/apd.ts](src/shared/config/apd.ts) |
| Jenis sensor dan ambang bawaan | [src/shared/config/lingkungan.ts](src/shared/config/lingkungan.ts) |
| Jenis peralatan ERT, interval inspeksi, ambang "segera" (`segeraHari`, per jenis) | [src/features/ert/config/ert.ts](src/features/ert/config/ert.ts) |
| Kategori indikasi, detektor (native/perlu validasi), kosakata lima domain status | [src/shared/config/indikasi.ts](src/shared/config/indikasi.ts) |
| Semua ambang aturan: SLA, temuan berulang, link menurun, risiko daya, bobot skor risiko, dll. | [src/shared/config/rules.ts](src/shared/config/rules.ts) |
| Hak tiap role di alur review | [src/shared/auth/roles.ts](src/shared/auth/roles.ts) |

## 4. Sambung ke API (mock → backend asli)

Daftar periksa. Centang satu per satu saat menyambungkan backend.

### Konfigurasi

- [ ] Tentukan base URL API. Belum ada variabel untuk ini. `TODO: nama variabel env base URL API (Vite hanya membaca variabel berawalan VITE_ lewat import.meta.env).`
- [ ] Tentukan URL WebSocket. `TODO: nama variabel env URL WebSocket.`
- [ ] Ganti isi fungsi mock satu file demi satu file (tabel di bawah). Tanda tangan fungsi dipertahankan supaya halaman tidak perlu diubah.

### Kontrak pengaturan

Bentuk data adalah tipe `Settings` dan `AssetRef` di [src/shared/config/defaults.ts](src/shared/config/defaults.ts). Mock-nya ada di [src/shared/data/settings.ts](src/shared/data/settings.ts).

| Metode | Path | Akses | Fungsi | Fungsi mock |
|---|---|---|---|---|
| `GET` | `/settings/public` | Tanpa sesi | `brand` dan `theme`, untuk halaman login | `fetchPublicSettings` |
| `GET` | `/settings` | Pengguna login | Semua pengaturan, termasuk `modules`. 401 jika sesi habis | `fetchSettings` |
| `PUT` | `/settings` | Super Admin | Menyimpan dan mengembalikan hasil tersimpan. 422 dengan galat per field, atau 403 | `putSettings` |
| `POST` | `/settings/reset` | Super Admin | Mengembalikan semua ke bawaan | Belum ada. Di mock, tiap tab memakai `PUT` dengan nilai bawaan |
| `POST` | `/settings/assets` | Super Admin | Unggah gambar (multipart), mengembalikan `AssetRef` berisi URL file | Belum ada. Di v1 gambar disimpan sebagai data URL di dalam `Settings` |

- [ ] Ganti `fetchPublicSettings`, `fetchSettings`, dan `putSettings`.
- [ ] Jalankan juga validasi `validateSettings` dan `assetError` di server.
- [ ] Ganti unggah gambar (`readAsset`) dengan `POST /settings/assets`.

### Endpoint data

Path endpoint data belum ditentukan. Fungsi di kiri adalah yang perlu diisi.

| File | Fungsi | Endpoint |
|---|---|---|
| [src/shared/auth/session.ts](src/shared/auth/session.ts) | `login`, `logout` | `TODO` |
| [src/shared/data/master.ts](src/shared/data/master.ts) | `master` (baca semua), `saveRecord(kind, row)` | `TODO` (satu set CRUD per entitas) |
| [src/features/overview/data/overview.ts](src/features/overview/data/overview.ts) | `getTrend`, `getRiskyZones` | `TODO` |
| [src/features/ppe/data/apd.ts](src/features/ppe/data/apd.ts) | `getSummary`, `getCompliance`, `getApdBreakdown`, `getHeatmap`, `getViolations`, `getCameraViolations`, `updateViolations` | `TODO` |
| [src/features/cctv/data/cctv.ts](src/features/cctv/data/cctv.ts) | `getCameras` | `TODO` |
| [src/features/environment/data/lingkungan.ts](src/features/environment/data/lingkungan.ts) | `getSensors`, `getRecent`, `getHistory`, `getThresholds`, `saveThreshold` | `TODO` |
| [src/features/ert/data/ert.ts](src/features/ert/data/ert.ts) | `getPersonnel`, `getEquipment` | `TODO` |
| [src/features/events/data/events.ts](src/features/events/data/events.ts) | `getEventList`, `getLatestEvents`, `findEvent`, `updateEvents` | `TODO` |
| [src/features/indications/data/indikasi.ts](src/features/indications/data/indikasi.ts) | `getIndications`, `findIndication`, `acknowledge`, `startReview`, `submitReview`, `requestClip` | `GET /events`, `POST /events/{id}/ack`, `POST /events/{id}/review`, `POST /events/{id}/clip-request` |
| [src/features/cases/data/kasus.ts](src/features/cases/data/kasus.ts) | `getCases`, `createCase`, `startInvestigation`, `closeCase`, `getActions`, `createAction`, `startAction`, `submitAction`, `verifyAction`, `cancelAction` | `POST /cases`, `POST /cases/{id}/close`, `POST /actions`, `PATCH /actions/{id}`, `POST /actions/{id}/verify`, `POST /actions/{id}/cancel` |
| [src/features/devices/data/sumber.ts](src/features/devices/data/sumber.ts) | `getSources`, `getHealthEvents`, `getUplinkSeries`, `getPowerSeries`, `getSyncLag` | `GET /sources`, `GET /sources/{id}/health-events`, `GET /links/{id}/uplink-series` |
| [src/features/decisions/data/keputusan.ts](src/features/decisions/data/keputusan.ts) | `getKpis`, `getSiteCards`, `getDecisions`, `getPriorityQueue`, `getDailyTrend`, `getHotspot`, `getSlaPanel`, `getCoverage` | `GET /sites/summary`, `GET /decisions`, `GET /priority-queue`, `GET /trend`, `GET /hotspot` |
| [src/features/analysis/data/analisis.ts](src/features/analysis/data/analisis.ts) | `getZoneRanking`, `getAnomalies`, `getWeekCompare`, `getAreaRanking`, `getRepeatRows`, `getBriefFacts` | `GET /analytics/*`, `GET /brief?lang` |
| [src/features/quality/data/kualitas.ts](src/features/quality/data/kualitas.ts) | `getOutcomeMix`, `getConfidenceBands`, `getShiftStats`, `getDetectorRows`, `getBacklogAging` | `GET /quality/*` |
| [src/features/assistant/data/asisten.ts](src/features/assistant/data/asisten.ts) | `getReply` | `POST /ask` (narrative service) |

Path di kolom kanan untuk modul alur review mengikuti brief developer; semua pemeriksaan status dan hak akses di mock (`authorize`, transisi yang ditolak dengan 409) harus diulang di server. Angka di layar tidak boleh hanya dihitung di frontend: aturan di [src/shared/lib/rules.ts](src/shared/lib/rules.ts) dipindah ke rules engine backend dengan nilai dari `config`.

Semua getter menerima objek `Filters` ([src/shared/data/filters.ts](src/shared/data/filters.ts)): `periode`, `site`, `zona`, `shift`, `apd`, `tipe`, `severity`. Saat site berisi `all`, nilai `zona` berbentuk pasangan `site/zona` (lihat [src/shared/data/scope.ts](src/shared/data/scope.ts)).

- [ ] Periksa ulang di server aturan master data yang sekarang hanya dicek di klien (`deactivateBlocker`, `removedZoneBlocker` di [src/shared/data/master.ts](src/shared/data/master.ts)).

### Event WebSocket

Topik diambil dari `wsTopics` di [src/shared/config/modules.ts](src/shared/config/modules.ts). Payload di bawah adalah bentuk data yang diterima callback hari ini. `TODO: format amplop pesan (nama field untuk topik dan payload) belum ditentukan.`

| Topik | Payload yang diterima callback | Tipe |
|---|---|---|
| `ppe.violation` | Satu pelanggaran | `Violation` di [src/features/ppe/data/apd.ts](src/features/ppe/data/apd.ts) |
| `environment.alarm` | Satu event lingkungan | `HseEvent` di [src/features/events/data/events.ts](src/features/events/data/events.ts) |
| `environment.reading` | Larik `{ id, reading: { t, v } }`, `t` dalam epoch ms | `Reading` di [src/features/environment/data/lingkungan.ts](src/features/environment/data/lingkungan.ts) |
| `camera.status` | `id` kamera dan `{ online, since }` | `CameraStatus` di [src/features/cctv/data/cctv.ts](src/features/cctv/data/cctv.ts) |
| `settings.updated` | Tanpa payload. Klien menampilkan banner "Pengaturan berubah", lalu memanggil `GET /settings` saat pengguna menekan Muat ulang | `subscribeSettingsUpdated` di [src/shared/data/settings.ts](src/shared/data/settings.ts). Di mock diwakili event `storage` antar-tab |

- [ ] Ganti isi setiap `subscribe*` dengan `new WebSocket(url)` dan panggil callback dari `onmessage`. Pertahankan pemeriksaan `topicOn()` supaya modul yang mati tidak berlangganan.

### Auth dan sesi

Hari ini `login()` mencocokkan email dengan daftar pengguna master dan kata sandi `demo123`. Sesi disimpan di sessionStorage (kunci `hse-session`), jadi bertahan saat halaman dimuat ulang tetapi hilang saat tab ditutup. Halaman lain membaca role dan akses site dari `useSession()`.

Timeout diatur di [src/shared/config/app.ts](src/shared/config/app.ts): sesi berakhir setelah 15 menit tanpa aktivitas, dan setiap klik atau tombol keyboard mengulang hitungan. Satu menit sebelum berakhir muncul peringatan dengan tombol Perpanjang. Setelah sesi habis, pengguna dikembalikan ke halaman login lalu ke halaman terakhir setelah login ulang.

- [ ] Ganti isi `login()` dan `logout()` dengan endpoint auth.
- [ ] `TODO: cara menyimpan dan mengirim token (cookie atau header) belum ditentukan.`
- [ ] `TODO: apakah timeout dihitung server atau tetap di klien.`

### Bagian sementara v1 yang harus diganti

- [ ] Ekspor CSV ([src/shared/lib/csv.ts](src/shared/lib/csv.ts)) dibuat di browser dari data yang sudah dimuat. Untuk data besar, pindahkan ke endpoint ekspor di server yang menerima filter yang sama, lalu ganti `downloadCsv` dengan unduhan dari endpoint itu.
- [ ] Ringkasan PDF ([src/features/events/lib/summary-pdf.ts](src/features/events/lib/summary-pdf.ts)) dibuat di browser dengan jsPDF. Halaman hanya memanggil `generateSummaryPdf()`, jadi fungsi ini bisa diganti panggilan ke server tanpa mengubah halaman.
- [ ] Pengaturan disimpan di localStorage ([src/shared/data/settings.ts](src/shared/data/settings.ts)).
- [ ] Master data disimpan di memori ([src/shared/data/master.ts](src/shared/data/master.ts)).
- [ ] Data mock fitur (`src/features/*/data/`) dan store lintas fitur (`src/shared/data/`).
- [ ] Nilai kartu KPI di Overview masih teks tetap di [src/features/overview/pages/dashboard.tsx](src/features/overview/pages/dashboard.tsx), belum diambil dari data.

## 5. Deploy on-premise

```bash
npm run build
```

Hasil build ada di `dist/`: file statis yang bisa disajikan web server apa pun. Font dibundel dari paket `@fontsource-variable`, jadi aplikasi tidak memanggil CDN dan bisa jalan di jaringan tertutup.

Aplikasi memakai routing di browser, jadi web server harus mengembalikan `index.html` untuk semua path yang bukan file. Satu-satunya contoh di repo adalah [vercel.json](vercel.json).

- `TODO: Dockerfile (belum ada di repo).`
- `TODO: konfigurasi nginx (belum ada di repo), termasuk fallback ke index.html.`
- `TODO: base path.` [vite.config.ts](vite.config.ts) tidak mengatur `base`, jadi aplikasi mengharapkan disajikan di root domain. Logo bawaan (`/logo-asa.webp`) dan video (`/CCTV/...`, `/mock/cctv/...`) juga memakai path absolut.
- `TODO: proxy WebSocket (wss) di depan backend.` Belum ada klien WebSocket sungguhan.
- `TODO: HTTPS.` Diatur di web server klien, bukan di aplikasi.

Branding dan modul di server klien diubah lewat halaman Pengaturan setelah deploy (bagian 3). Tidak perlu build ulang. Catatan: selama pengaturan masih di localStorage, perubahan hanya berlaku di browser yang menyimpannya. Agar berlaku untuk semua pengguna, kontrak `/settings` harus sudah tersambung ke backend.

## 6. Struktur folder

```
public/
  CCTV/                klip CCTV pilihan untuk profil pabrik
  logo-asa.webp        logo bawaan
  mock/cctv/           klip MP4 untuk kamera mock
src/
  main.tsx              entry point Vite
  app/                  bootstrap, provider, router, layout, dan navigasi aplikasi
  features/             page dan kode domain, dikelompokkan per fitur
    actions/ admin/ analysis/ assistant/ auth/
    cases/ cctv/ decisions/ detection/ devices/
    environment/ ert/ events/ guide/ indications/
    learning/ overview/ ppe/ quality/ recommendations/
    settings/ storybook/
    <feature>/{pages,data,components,config}/ (sesuai kebutuhan)
  shared/               UI, konfigurasi dan state global, kontrak, serta helper lintas fitur
    components/          komponen yang dipakai beberapa fitur
    charts/               chart dan gauge reusable
    data/, auth/          pengaturan, master data, dan sesi
    config/, lib/, ui/    kontrak dan utilitas bersama
  react-highlight.d.ts  deklarasi tipe global
```

| Folder | Isi |
|---|---|
| [src/app/](src/app/) | Bootstrap aplikasi, routing, layout global, halaman sistem, dan menu |
| [src/features/](src/features/) | Fitur seperti PPE, CCTV, Event, Kasus, Analisis, dan Lingkungan. Tiap fitur menyimpan page, data, config, dan komponen miliknya |
| [src/shared/](src/shared/) | Komponen lintas fitur, pengaturan global, master data, kontrak domain, chart, dan helper |
| [src/features/storybook/](src/features/storybook/) | Halaman `/storybook`, layout, registry, dan contoh komponen |
| [src/main.tsx](src/main.tsx) | Entry point Vite yang memasang `App` ke elemen `root` |

Folder fitur memakai nama singkat sesuai domain. Data dan komponen tetap bersama pemilik fiturnya; `shared/` hanya untuk kode yang dipakai lintas fitur dan tidak memiliki pemilik domain khusus. Pengaturan serta registry modul berada di `shared/` karena dipakai oleh shell aplikasi dan beberapa fitur. Alias `@/` menunjuk ke `src/`.

Arah dependensi: `app/` menyusun `features/` dan `shared/`; fitur bergantung pada `shared/`, dan boleh memakai modul sempit dari fitur lain untuk alur yang memang menggabungkannya. `shared/` tidak mengimpor `app/` atau `features/`. Hindari siklus antar modul; impor lintas fitur untuk katalog Storybook adalah pengecualian.

## 7. Tambah modul baru

Registry ada di [src/shared/config/modules.ts](src/shared/config/modules.ts) (`moduleDefs`). Menu, rute, kartu KPI, filter tipe event, dan stream realtime diturunkan dari sana.

1. Tambah id modul ke tipe `ModuleId` dan ke `modules` di `defaultSettings` serta preset `contohKlien` di [src/shared/config/defaults.ts](src/shared/config/defaults.ts).
2. Tambah id yang sama ke `moduleIds` di [src/shared/data/settings.ts](src/shared/data/settings.ts). Tanpa ini, pengaturan tersimpan dianggap tidak valid dan diabaikan.
3. Tambah entri di `moduleDefs`:
   - `route`: alamat halaman.
   - `menu`: `label` dan `icon` (ikon dari `lucide-react`).
   - `roles`: role yang boleh membuka.
   - `kpiCards`: label kartu KPI yang disumbangkan ke Overview.
   - `eventTypes`: tipe event milik modul.
   - `wsTopics`: topik WebSocket milik modul.
   - `alsoHides` dan `note`: teks tambahan untuk dialog konfirmasi di tab Modul.
4. Masukkan `fromModule("<id>")` ke grup menu yang tepat di `allGroups`, [src/app/config/nav.ts](src/app/config/nav.ts).
5. Daftarkan komponen halaman di `builtPages`, [src/app/router.tsx](src/app/router.tsx). Tanpa ini, rute menampilkan halaman placeholder.
6. Jika modul punya tipe event baru, tambahkan ke `EventType` dan `eventTypes` di [src/shared/config/events.ts](src/shared/config/events.ts).
7. Jika modul menyumbang kartu KPI, tambahkan `KpiCard` di [src/features/overview/pages/dashboard.tsx](src/features/overview/pages/dashboard.tsx) dengan `label` yang sama persis dengan isi `kpiCards`.
8. Di fungsi `subscribe*` modul, berhenti lebih awal jika `topicOn("<topik>")` bernilai false.

Dependensi antarmodul belum punya field di registry. Yang ada: item menu bisa bergantung pada beberapa modul lewat `modules` di `nav.ts`, misalnya menu Kamera tampil selama CCTV atau PPE aktif. `TODO: perlu field dependensi di ModuleDef atau tidak.`

## 8. Role dan hak akses

Aturan ada di [src/shared/auth/session.ts](src/shared/auth/session.ts), [src/app/config/nav.ts](src/app/config/nav.ts), dan `canEdit` per entitas di [src/features/admin/pages/admin.tsx](src/features/admin/pages/admin.tsx).

Empat role template (Super Admin, Admin Site, HSE Officer, Viewer) ditambah lima role operasional dari alur review: Site Manager, HSE Manager, Operator Control Room, Area Supervisor, dan IT/OT Admin. Role operasional tidak membuka Administrasi.

| Hak | Super Admin | Admin Site | HSE Officer | Viewer |
|---|---|---|---|---|
| Site yang terlihat | Semua | Site miliknya | Site miliknya | Site miliknya |
| Halaman modul bisnis | Ya | Ya | Ya | Ya |
| Acknowledge dan Close event (alur sederhana) | Ya | Ya | Ya | Tidak, tombol disembunyikan |
| Ubah ambang sensor | Ya | Ya | Ya | Tidak |
| Grup menu Administrasi | Ya | Ya | Disembunyikan, 403 | Disembunyikan, 403 |
| Ubah Zona, Site, Shift, Pengguna | Ya | Hanya lihat | Tidak | Tidak |
| Ubah Kamera dan Sensor | Ya | Ya, di site miliknya | Tidak | Tidak |
| Pengaturan | Ya | 403 | 403 | 403 |

"Site miliknya" adalah field `site` pada pengguna. Pembatasan ini berlaku untuk semua role selain Super Admin, bukan hanya Admin Site. Admin Site hanya melihat pengguna non-Super Admin yang berbagi site dengannya.

Di alur sederhana, HSE Manager dan Operator Control Room juga boleh Acknowledge/Close; HSE Manager dan IT/OT Admin juga boleh mengubah ambang sensor.

Hak di alur review ([src/shared/auth/roles.ts](src/shared/auth/roles.ts), diperiksa juga oleh mock API):

| Aksi | Site Manager | HSE Manager | Control Room | Area Supervisor | IT/OT Admin | HSE Officer | Admin Site, Viewer |
|---|---|---|---|---|---|---|---|
| Acknowledge | – | ✓ | ✓ | – | – | ✓ | – |
| Simpan hasil review | – | ✓ | ✓ | – | – | ✓ | – |
| Buka / tutup kasus | ✓ | ✓ | – | – | – | – | – |
| Buat tindakan | ✓ | ✓ | – | ✓ | ✓ | ✓ | – |
| Perbarui tindakan | – | ✓ | – | milik sendiri | milik sendiri | milik sendiri | – |
| Verifikasi / batalkan | – | ✓ | – | – | – | – | – |
| Minta klip | – | ✓ | ✓ | – | ✓ | ✓ | – |
| Ekspor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Super Admin boleh semuanya. Verifikator tindakan tidak boleh PIC-nya sendiri, siapa pun role-nya. Tombol tetap bisa ditekan oleh semua role; yang tidak berhak mendapat pesan role mana yang boleh.

`TODO: matriks ini ilustratif; konfirmasi dengan HSE klien. Konfirmasi juga apakah HSE Officer boleh mengubah ambang sensor.`

## 9. Master data

Urutan pembuatan: Zona → Site → Kamera, lalu Sensor, Shift, dan Pengguna. Zona adalah katalog area yang dibuat sekali dan boleh dipakai beberapa site; kode zona unik untuk semua site. Site memilih zona yang dimilikinya. Kamera dan sensor menempel ke satu pasangan site + zona. Data tidak pernah dihapus, hanya dinonaktifkan, supaya event lama tetap menemukan zona dan kameranya. Penonaktifan ditolak selama masih ada kamera atau sensor aktif di bawahnya. Akun sendiri dan Super Admin aktif terakhir juga tidak bisa dinonaktifkan.

```
Zona (katalog, kode unik global)
  │  banyak-ke-banyak
  ▼
Site ──► Kamera  (site + zona)
     └─► Sensor  (site + zona)

Shift     berdiri sendiri
Pengguna  role + daftar site
```

Aturannya ada di `deactivateBlocker` dan `removedZoneBlocker`, [src/shared/data/master.ts](src/shared/data/master.ts).

## 10. Catatan CCTV

- Pemutar memakai Video.js ([src/features/cctv/components/camera-player.tsx](src/features/cctv/components/camera-player.tsx)) dengan sumber berupa URL. Field kamera: `streamUrl` (stream untuk grid), `streamUrlHd` (opsional, sumber lebih tinggi untuk tampilan satu kamera), dan `streamType` (MIME type). Sumber `delivery`/`package_edit` dan LPR menyediakan encode detail terpisah; kamera lain memakai video grid yang sama di tampilan satu kamera.
- HLS (`application/x-mpegURL`) diputar lewat media HLS Video.js. Tipe lain diserahkan ke elemen video bawaan browser, jadi MP4 berjalan. DASH belum ditangani. `TODO: tambah dukungan DASH jika klien memakainya.`
- RTSP tidak bisa diputar di browser. Perlu gateway yang mengubahnya ke HLS, dan itu di luar lingkup template.
- Server stream harus mengizinkan CORS dari domain dashboard.
- Jika URL stream memakai token, token perlu diperbarui sebelum kedaluwarsa. Template belum menangani ini.
- Latensi HLS beberapa detik, jadi gambar tidak benar-benar real time.
- Stream yang tidak bergerak selama 10 detik dianggap putus dan tile menampilkan status error.

Konfigurasi grid (1/4/9/16 tile, rotasi halaman di mode layar penuh, lama sorotan event) ada di [src/features/cctv/config/cctv.ts](src/features/cctv/config/cctv.ts).

## 11. Komponen dan katalog

Repo tidak memakai paket Storybook. Katalog komponen adalah halaman di dalam aplikasi, di `/storybook`, dan berjalan dengan perintah yang sama:

```bash
npm run dev
```

Lalu buka `http://localhost:5173/storybook`. Katalog tidak butuh login. Dari dashboard, buka lewat menu Katalog komponen di bawah sidebar.

| Komponen | File |
|---|---|
| Kartu KPI | [src/shared/components/kpi-card.tsx](src/shared/components/kpi-card.tsx) |
| Grafik line, bar, donut, heatmap | [src/features/overview/components/overview-charts.tsx](src/features/overview/components/overview-charts.tsx), [src/features/ppe/components/apd-charts.tsx](src/features/ppe/components/apd-charts.tsx) |
| Gauge sensor | [src/features/environment/components/sensor-gauge.tsx](src/features/environment/components/sensor-gauge.tsx) |
| Feed event | [src/features/events/components/event-feed.tsx](src/features/events/components/event-feed.tsx) |
| Tabel (urut, halaman, cari) | [src/features/events/components/event-table.tsx](src/features/events/components/event-table.tsx) |
| Viewer foto bukti dengan bounding box, drawer detail | [src/features/events/components/event-drawer.tsx](src/features/events/components/event-drawer.tsx) |
| Badge status dan severity | [src/shared/config/events.ts](src/shared/config/events.ts) |
| Tile dan grid kamera | [src/features/cctv/components/camera-tile.tsx](src/features/cctv/components/camera-tile.tsx) |
| Filter bar | [src/shared/components/filter-bar.tsx](src/shared/components/filter-bar.tsx) |
| Tombol export | [src/shared/lib/csv.ts](src/shared/lib/csv.ts), [src/features/events/components/summary-report.tsx](src/features/events/components/summary-report.tsx) |
| State kosong, loading, error | [src/shared/components/widget.tsx](src/shared/components/widget.tsx) |
| Chip severity (4 level) | [src/shared/components/severity-chip.tsx](src/shared/components/severity-chip.tsx) |
| Chip lima domain status alur review | [src/shared/components/status-chip.tsx](src/shared/components/status-chip.tsx) |
| Tabel register (urut, halaman, pilih massal) | [src/shared/components/register-table.tsx](src/shared/components/register-table.tsx) |
| Jejak audit | [src/shared/components/audit-timeline.tsx](src/shared/components/audit-timeline.tsx) |
| Form review, kasus, tindakan, alasan | [src/shared/components/workflow-forms.tsx](src/shared/components/workflow-forms.tsx) |
| Drawer indikasi, kasus, tindakan | [src/features/indications/components/indikasi-drawer.tsx](src/features/indications/components/indikasi-drawer.tsx), [kasus-drawer.tsx](src/features/cases/components/kasus-drawer.tsx), [tindakan-drawer.tsx](src/features/actions/components/tindakan-drawer.tsx) |
| Kartu kesehatan site | [src/features/decisions/components/site-cards.tsx](src/features/decisions/components/site-cards.tsx) |

Daftar halaman katalog ada di [src/features/storybook/stories/registry.ts](src/features/storybook/stories/registry.ts).

Pemilih preset ada di header katalog: Pengaturan tersimpan, Preset: Bawaan, dan Preset: Klien contoh. Semua komponen langsung tampil dengan nama, warna, dan modul preset itu tanpa menyimpannya, dan preset dilepas saat keluar dari katalog. Preset didefinisikan di `presets`, [src/shared/config/defaults.ts](src/shared/config/defaults.ts).

## 12. Batasan v1

- Backend dan model AI belum ada. Semua data dummy.
- Permit to Work, inspeksi/checklist K3, training, investigasi insiden/CAPA, dan aplikasi mobile tidak termasuk.
- Reset password belum ada.
- Jejak audit alur review ada, tetapi hanya di memori browser (hilang saat dimuat ulang). Event alur sederhana masih hanya punya riwayat status.
- Antarmuka tersedia dalam Bahasa Indonesia dan Inggris (bagian 17). Isi record (nama zona, judul kasus/tindakan, catatan, alasan review) tetap dalam bahasa saat ditulis. Katalog komponen (`/storybook`) hanya Bahasa Indonesia.
- AI Assistant dan "Buat draf dengan AI" adalah mock: jawaban disusun dari fakta yang dihitung, tanpa LLM (bagian 16).
- Indikasi AI non-APD belum masuk daftar Event & laporan; keduanya berbagi data APD.
- ERT versi dasar: personel dan peralatan hanya ditampilkan. Belum ada tambah, ubah, atau catat inspeksi.
- Lingkungan versi dasar: nilai sensor, status, grafik tren, dan ambang per jenis sensor.
- Ekspor hanya CSV (dengan pemisah titik koma dan BOM supaya terbaca Excel berbahasa Indonesia) dan ringkasan PDF. Belum ada file `.xlsx`.
- Kartu KPI di Overview masih angka tetap.
- Master data dan ambang sensor kembali ke awal saat halaman dimuat ulang.
- Belum ada test suite. Pemeriksaan otomatis: [src/shared/lib/shift-time.check.ts](src/shared/lib/shift-time.check.ts) dan [src/shared/lib/rules.check.ts](src/shared/lib/rules.check.ts) (semua aturan di rules engine).

## 13. Variabel environment

Belum ada. Kode tidak membaca `import.meta.env`, dan repo tidak punya `.env` atau `.env.example`.

| Nama | Fungsi | Bawaan |
|---|---|---|
| `TODO` | Base URL API | `TODO` |
| `TODO` | URL WebSocket | `TODO` |

## 14. Skrip dan troubleshooting

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server dev dengan hot reload |
| `npm run build` | Cek tipe (`tsc -b`) lalu build ke `dist/` |
| `npm run preview` | Menyajikan hasil build untuk dicek |
| `npm run lint` | Oxlint |

Belum ada test suite. Pemeriksaan jam shift, aturan, dan pengelompokan usia tindakan dijalankan langsung (butuh Node 23.6 atau lebih baru):

```bash
node src/shared/lib/shift-time.check.ts
node src/shared/lib/rules.check.ts
node src/features/actions/lib/action-aging.check.ts
```

Stream kamera tidak tampil:

1. Buka URL stream langsung di browser. Jika gagal, masalahnya di server stream.
2. Cek console browser. Galat CORS berarti server stream belum mengizinkan domain dashboard.
3. Pastikan formatnya HLS atau MP4. URL `rtsp://` tidak bisa diputar.
4. Pastikan `streamType` sesuai, misalnya `application/x-mpegURL` untuk HLS.

WebSocket putus di belakang proxy: `TODO` (belum ada klien WebSocket). Saat sudah ada, proxy harus meneruskan header `Upgrade` dan `Connection`, dan halaman HTTPS harus memakai `wss://`.

Favicon tidak berubah setelah disimpan: browser menyimpan favicon di cache. Muat ulang paksa (Ctrl+Shift+R) atau buka di jendela privat.

## 15. Profil data dan skenario demo

Pengaturan → **Profil data** memilih set data contoh tanpa build ulang. Preset Pertambangan memakai profil tambang.

| Profil | Isi |
|---|---|
| Pabrik | Site Cikarang, Karawang, Balikpapan; uplink fiber; satu server analitik edge per site; sensor lingkungan di dalam gedung |
| Pertambangan | Site Berau, Kaltim (tambang, WITA, Starlink SAT-02) dan Site Cilegon, Banten (prosesing & terminal, WIB, fiber FO-01); server edge EDGE-01/02; Aegis Intelligence Pole POLE-01/02; Manpack MANPACK-01; zona Pit, Haul Road, Loading Point, Disposal, BBM; shift 12 jam |

Cerita demo di [src/shared/data/skenario.ts](src/shared/data/skenario.ts) dihitung relatif ke waktu halaman dimuat, jadi selalu "tadi malam" dan "pagi ini":

- SAT-02 putus ±2 jam (9 indikasi tertahan di antrean edge lalu terkirim, terlihat di jeda sinkron), lalu menurun di bawah 5 Mbps.
- POLE-02 baterai 22%, runtime 7 jam → kartu risiko daya. POLE-01 tanpa indikasi 8 hari → kartu relokasi.
- CAM-07 dan CAM-14 offline (sama dengan halaman CCTV); CAM-11 frame rate rendah.
- Indikasi Kritis di Loading Point 02 (IND-BRU-K001) belum di-acknowledge; APD berulang di zona yang sama.

Data dibangkitkan deterministik per site (`seeded`), jadi angka sama setiap muat ulang di hari yang sama. Indikasi APD adalah record pelanggaran APD yang sama, sehingga halaman Kepatuhan APD dan alur review selalu sepakat: Close di alur sederhana dicatat sebagai temuan Terkonfirmasi dengan catatannya sebagai alasan. Halaman **Panduan Demo** (`/panduan`) berisi skenario terpandu, pembagian tanggung jawab, status kapabilitas detektor, aturan demo, akun per role, dan timeline audit sesi. Matikan modulnya sebelum dipakai klien.

## 16. Alur review, lapisan keputusan, dan AI Assistant

Lima entitas dengan status masing-masing, tidak pernah dicampur ([src/shared/config/indikasi.ts](src/shared/config/indikasi.ts)):

```
Indikasi AI   Baru → Acknowledged → Sedang direview → Review selesai | Selesai → Kasus terbuka → Selesai
Temuan        Terkonfirmasi · Bukan pelanggaran · Alarm palsu · Tidak dapat dipastikan (revisi = temuan baru)
Kasus         Terbuka → Investigasi → Perlu tindakan → Menunggu verifikasi → Ditutup
Tindakan      Ditugaskan → Dikerjakan → Menunggu verifikasi → Terverifikasi/Ditutup   (Dibatalkan dari mana saja)
Sumber        Online · Menurun · Offline · Tidak melapor · Tidak diketahui
```

Overdue adalah turunan dari tenggat, bukan status. Review wajib alasan ≥ 10 karakter; kasus hanya dibuka orang dari temuan terkonfirmasi; kasus ditutup hanya bila semua tindakannya selesai; tindakan diverifikasi oleh selain PIC. Setiap indikasi membawa asal deteksi (tier, perangkat, uplink) dan jeda sinkron.

**Pusat Keputusan** menampilkan kartu keputusan dari aturan di [src/shared/lib/rules.ts](src/shared/lib/rules.ts) (nilai di [src/shared/config/rules.ts](src/shared/config/rules.ts)): belum ditangani melewati SLA, temuan berulang, kamera/link/daya, pole idle, tindakan overdue, kandidat tuning detektor, selisih SLA shift malam, anomali. Setiap kartu menulis aturannya, buktinya (ID yang bisa dibuka), rekomendasi, dan pemiliknya. Kartu per aturan dibatasi supaya satu site ramai tidak menutupi yang lain.

**AI Assistant** (`/asisten`), **brief manajemen**, dan **Tanya Asisten** di Analisis Risiko adalah mock:

- Fakta dihitung oleh `briefFacts` di [src/features/analysis/data/analisis.ts](src/features/analysis/data/analisis.ts); narasi diisi dari template, setiap klaim mengutip ID.
- Pertanyaan dicocokkan ke intent (risiko, alasan, keputusan, overdue, antrean, kamera, link/daya, alarm palsu, shift, perubahan mingguan, brief, kasus, satu zona). Pertanyaan di luar data ditolak dengan saran.
- "Buat draf dengan AI" dan jawaban asisten ditampilkan kata demi kata seperti keluaran model, dengan label demo.
- Riwayat percakapan disimpan di localStorage browser per pengguna (kunci `hse-asisten:<userId>`).
- Jawaban yang mengutip indikasi membawa kartu **bukti**. Pertanyaan seperti "pelanggaran kritis hari ini" membuka penampil bukti di sisi kanan (drawer di layar sempit): thumbnail, tombol minta klip dari edge, lalu pemutar klip, tanpa keluar dari halaman asisten. Thumbnail di mock adalah frame video kamera; API edge yang mengirim URL thumbnail dan klip sebenarnya.

**Halaman deteksi** (Kepatuhan APD dan `/pemantauan/zona-terlarang`) memakai satu template ([src/features/detection/components/detection-view.tsx](src/features/detection/components/detection-view.tsx), data di [src/features/detection/data/use-case.ts](src/features/detection/data/use-case.ts)): angka, kamera sorotan, dan tab. Zona Terlarang: orang terdeteksi di area terlarang yang digambar di kamera (seluruh gambar atau poligon, bisa dengan jam aktif).

**Learning (V2)** disembunyikan dari menu untuk sekarang (tidak ada route). Halamannya tetap ada di [src/features/learning/pages/learning.tsx](src/features/learning/pages/learning.tsx) untuk V2: jumlah sampel berlabel dihitung dari review 30 hari, sedangkan versi model, continuous learning, latih ulang, dan uji model (unggah gambar/video lokal) masih simulasi di [src/features/learning/data/learning.ts](src/features/learning/data/learning.ts).

Menyambungkan LLM sungguhan: ganti isi `getReply` di [src/features/assistant/data/asisten.ts](src/features/assistant/data/asisten.ts) (dan tombol draf di [src/features/analysis/pages/analisis.tsx](src/features/analysis/pages/analisis.tsx)) dengan panggilan ke narrative service di backend. Service hanya menerima JSON fakta (lihat "Lihat fakta yang dikirim ke model"), tanpa video, thumbnail, atau koordinat; wajib mengutip ID, tidak boleh mengarang angka atau mengklaim akurasi AI, dan tidak pernah menulis ke alur kerja. `TODO: kunci API dan pemanggilan model hanya di backend, bukan di browser.`

## 17. Bahasa (ID/EN)

Tombol **ID | EN** di header (dan di halaman masuk) mengganti bahasa antarmuka tanpa memuat ulang. Pilihan disimpan per browser di localStorage (`hse-lang`), bawaan Bahasa Indonesia. Tanggal, angka, dan nama hari ikut locale (`id-ID` / `en-GB`).

Teks ditulis berpasangan di tempat dipakai lewat [src/shared/lib/i18n.ts](src/shared/lib/i18n.ts):

```tsx
<Button>{tr("Simpan", "Save")}</Button>
toast.success(tr(`${n} indikasi di-acknowledge.`, `${n} indications acknowledged.`))
```

- Label di config yang dibaca saat modul dimuat (severity, status, kategori, menu, role, filter) ditulis sebagai getter, `get label() { return tr("Kritis", "Critical") }`, supaya ikut bahasa aktif.
- Ganti bahasa me-remount aplikasi (`key={lang}` di [src/app/App.tsx](src/app/App.tsx)), jadi semua halaman dan data dirender ulang.
- Kunci internal tetap Bahasa Indonesia: `kpiCards` di registry modul dicocokkan dengan kunci, bukan label tampilan.
- Brief manajemen dan asisten punya pilihan bahasa sendiri yang dimulai dari bahasa antarmuka; pertanyaan berbahasa Inggris dijawab dalam bahasa Inggris.

Menambah teks baru: tulis `tr("…", "…")` di tempatnya. Untuk label di objek tingkat modul, pakai getter. `TODO: bila perlu bahasa ketiga, ganti tr() dengan kamus berkunci; pasangan yang ada bisa diekstrak otomatis.`

## 18. Tautan

- Konteks produk dan keputusan stack: `TODO: catatan pemilihan stack (docs/stack.md belum ada).`
- PIC: J. N. Zega.
