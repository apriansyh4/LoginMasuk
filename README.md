# AR-LOKAL

**Satu foto produk UMKM jadi model 3D yang bisa ditaruh di ruangan pembeli lewat AR.**

AR-LOKAL membantu penjual tas, sepatu, perhiasan, keramik, dan kerajinan tangan menampilkan produknya dalam 3D. Penjual cukup mengunggah satu foto; AI memeriksa fotonya, membangun model 3D, lalu pembeli bisa memutar produk dan menaruhnya di meja atau lantai lewat kamera HP dengan ukuran aslinya.

| | |
|---|---|
| **Aplikasi** | https://login-masuk.vercel.app/ |
| **Video demo** | https://youtu.be/Mu7Hixaz-6w?si=eAdM1NZhlA4AOfx2 |
| **Kompetisi** | LOGICODIX 2026 Hackathon Competition |
| **Kategori** | Web |
| **Subtema** | Local MSME & Creative Economy |
| **Nama tim** | LoginMasuk |

**Anggota tim**

| Nama | NIM |
|---|---|
| Apriansyah Sitompul | 0920250058 |
| Ilfaj Al-Nur | 0920250067 |
| Muhammad Bintang Basev Al Qadr | 0920250070 |
| Syalwa Insani | 0920250080 |

---

## Untuk juri: mencoba dalam 3 menit

**Akun demonstrasi**

| Email | Kata sandi |
|---|---|
| loginmasuk@gmail.com | LoginMasuk_12 |

1. Buka https://login-masuk.vercel.app lalu **Masuk** dengan akun demo.
2. Buka **Riwayat** dan pilih salah satu produk contoh. Model 3D bisa diputar dan diperbesar.
3. Buka halaman yang sama **di HP** (Chrome di Android dengan ARCore, atau Safari di iPhone), lalu tekan **Lihat di ruangan Anda (AR)**. Arahkan kamera ke lantai atau meja dan ketuk layar.
4. Di halaman model, ubah **Ukuran asli produk** (misalnya tinggi 20 cm). Model dan AR langsung menyesuaikan.
5. Untuk mencoba dari awal: buka **Studio**, unggah foto satu produk dengan latar polos, tunggu hasil validasi, lalu tekan **Buat model 3D**.

> **Jam aktif layanan AI:** 08.00–22.00 WIB, selama masa penilaian.
> Layanan AI (validasi foto dan pembuatan model 3D baru) berjalan di laptop tim karena modelnya butuh RAM ±16 GB dan tidak ada layanan cloud gratis yang mampu menjalankannya. Di luar jam aktif, Studio menampilkan keterangan *"Layanan validasi AI sedang tidak tersedia"* dan tidak menyimpan apa pun. Langkah 1–4 (melihat model, AR, ubah ukuran) **selalu bisa dicoba 24 jam**.

---

## Daftar isi

1. [Masalah dan solusi](#masalah-dan-solusi)
2. [Fitur yang sudah berjalan](#fitur-yang-sudah-berjalan)
3. [Teknologi](#teknologi)
4. [Arsitektur dan alur data](#arsitektur-dan-alur-data)
5. [Instalasi dan menjalankan aplikasi](#instalasi-dan-menjalankan-aplikasi)
6. [Variabel lingkungan](#variabel-lingkungan)
7. [Dokumentasi penggunaan AI](#dokumentasi-penggunaan-ai)
8. [Atribusi](#atribusi)
9. [Keterbatasan](#keterbatasan)
10. [Lisensi](#lisensi)

---

## Masalah dan solusi

**Masalah.** Pelaku UMKM aksesoris fashion dan kerajinan menjual produknya hanya dengan foto dua dimensi. Foto tidak memperlihatkan bentuk utuh dan ukuran produk, sehingga calon pembeli ragu. Membuat model 3D atau pengalaman AR biasanya butuh studio, perangkat lunak berbayar, atau jasa desainer yang tidak terjangkau UMKM.

**Solusi.** AR-LOKAL adalah aplikasi web yang:

1. menerima **satu foto produk** dari penjual,
2. **memeriksa foto dengan AI**: ketajaman, cahaya, jumlah benda, keberadaan orang atau hewan, produk terpotong, dan kategori,
3. **membangun model 3D** dengan TripoSR,
4. menampilkan model yang bisa diputar dan **menaruhnya di ruangan nyata lewat AR** dengan ukuran aslinya.

Semua AI memakai model open-source yang berjalan di server sendiri. Tidak ada layanan AI berbayar.

**Target pengguna**

| Pengguna | Kebutuhan |
|---|---|
| Penjual UMKM fashion dan kerajinan | Menampilkan produk secara meyakinkan tanpa biaya modeling 3D |
| Calon pembeli | Melihat bentuk dan ukuran produk sebelum membeli |

---

## Fitur yang sudah berjalan

| Fitur | Keterangan |
|---|---|
| **Akun** | Daftar, verifikasi email, masuk/keluar, lupa kata sandi. Peran pengguna dan admin. |
| **Studio** | Unggah satu foto (JPG/PNG/WEBP, maks. 10 MB), nama produk, ukuran asli opsional, dan konfirmasi hak atas gambar. |
| **Validasi gambar AI** | Menolak foto buram, gelap, resolusi rendah, berisi orang/tangan/hewan, lebih dari satu benda, produk terpotong, atau di luar kategori. Setiap penolakan disertai alasan dan saran perbaikan. Bila AI tidak tersedia, tidak ada yang disimpan. |
| **Pembuatan model 3D** | TripoSR membuat model 3D (GLB) dari foto yang lolos. Progres per tahap tampil langsung, bisa dibatalkan dan diulang. Kuota 5 model per hari per pengguna, antrean maksimal 10. |
| **Penampil 3D** | Model bisa diputar dan diperbesar, berlabel "Aproksimasi hasil AI", menampilkan status kualitas dan ukuran, dan bisa diunduh (GLB). |
| **AR "Lihat di ruangan Anda"** | WebXR (Chrome Android), Google Scene Viewer, dan Apple Quick Look. Produk tampil dengan ukuran nyata. Tombol hanya muncul di perangkat yang mendukung AR. |
| **Ubah ukuran asli** | Setelah model jadi, penjual bisa mengisi tinggi, lebar, atau kedalaman asli. File model diskalakan ulang tanpa dibuat ulang, dan AR ikut menyesuaikan. |
| **Riwayat** | Semua kiriman, termasuk yang ditolak beserta alasannya, dengan filter dan halaman. Bisa dibuka, dibuat ulang, atau dihapus beserta filenya. |
| **Admin** | Ringkasan jumlah pengguna, kiriman, validasi ditolak, dan status layanan AI. |
| **Privasi dan keamanan** | Row Level Security di semua tabel, berkas privat dengan signed URL, rate limit, proteksi CSRF, CSP dengan nonce, metadata EXIF dihapus, dan batas simpan 30 hari untuk setiap kiriman. |

---

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend dan server web | Next.js 16 (App Router, TypeScript), React, Tailwind CSS v4, Zod, sharp, `@supabase/ssr` |
| 3D dan AR | `@google/model-viewer` (WebXR, Scene Viewer, Quick Look) |
| Database, Auth, Storage, Realtime | Supabase (PostgreSQL + RLS, Auth, Storage, Realtime) |
| Layanan AI | Python, FastAPI, PyTorch, ONNX Runtime, OpenCV, MediaPipe, OpenCLIP, TripoSR, scikit-image, trimesh |
| Hosting | Vercel (region Singapura), Supabase Cloud (Singapura), layanan AI di laptop tim melalui ngrok |
| Pengujian | Vitest, Playwright, pytest, Ruff, ESLint, Prettier |

**Layanan pihak ketiga** (semuanya paket gratis): Supabase, Vercel, ngrok (alamat tetap untuk layanan AI), dan Hugging Face Hub (hanya untuk mengunduh bobot model sekali).

---

## Arsitektur dan alur data

```mermaid
flowchart LR
  subgraph U["HP / laptop pengguna"]
    B["Browser: Next.js UI + model-viewer"]
  end
  subgraph V["Vercel (Singapura)"]
    W["Next.js server: API, auth, validasi input"]
  end
  subgraph SB["Supabase (Singapura)"]
    A[(Auth)]
    D[("PostgreSQL + RLS")]
    S[("Storage privat: uploads, models")]
    R[[Realtime]]
  end
  subgraph L["Laptop tim"]
    T["ngrok (alamat tetap)"]
    AI["ai-service FastAPI: validasi gambar + TripoSR"]
  end

  B -- HTTPS --> W
  W -- sesi, data --> A & D
  W -- simpan foto --> S
  W -- x-service-token --> T --> AI
  AI -- progres job, GLB --> D & S
  D -- perubahan status job --> R --> B
  B -- signed URL GLB --> S
```

**Alur satu produk**

1. Penjual mengunggah foto di **Studio**. Server Next.js memeriksa jenis berkas dari isinya (bukan dari ekstensi), menghapus EXIF, lalu mengirim foto ke **ai-service**.
2. ai-service menjalankan ISNet (pemisahan latar), YOLOX (orang/hewan/benda), MediaPipe (tangan/wajah/tubuh), OpenCLIP (kategori), dan OpenCV (ketajaman/cahaya). Foto dan hasil validasi disimpan di Supabase.
3. Bila lolos, penjual menekan **Buat model 3D**. Job masuk antrean dan dikirim ke ai-service.
4. ai-service menjalankan TripoSR, membersihkan mesh, menskalakan ke meter, memeriksa kualitas, lalu mengunggah GLB ke Storage sambil memperbarui status per tahap.
5. Browser menerima progres lewat Realtime. Setelah selesai, halaman model memuat GLB melalui signed URL dan menampilkan tombol AR.

---

## Instalasi dan menjalankan aplikasi

### Kebutuhan

- Node.js 22+, Python 3.10–3.12, Git
- Akun Supabase dan Vercel (gratis), atau Supabase lokal (Docker + Supabase CLI)
- Komputer untuk layanan AI dengan RAM minimal 16 GB. GPU NVIDIA disarankan; tanpa GPU tetap bisa memakai mode CPU (diukur ±26 detik per model di laptop tim).

### 1. Database (Supabase)

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_ID>
npx supabase db push --remote     # tabel, RLS, trigger, bucket storage
```

Untuk Supabase lokal: `npx supabase start` lalu `npx supabase db reset`.

### 2. Layanan AI (`ai-service`)

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate            # Windows (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt -r requirements-models.txt -r requirements-reconstruction.txt
python -I scripts/download_models.py
copy ai.env.example ai.env        # isi nilainya, lihat tabel variabel di bawah
uvicorn ai_service.app:app --port 8000
```

**Di Windows (cara yang dipakai tim):**

1. Pasang ngrok (`winget install ngrok.ngrok`) dan simpan authtoken (`ngrok config add-authtoken <TOKEN>`).
2. Isi `NGROK_DOMAIN` di `ai-service\ai.env` dengan dev domain gratis dari dashboard ngrok.
3. Jalankan `scripts\start-ai.cmd`. Skrip ini menyalakan ai-service dan ngrok, lalu menampilkan alamat tetap.
4. Agar menyala otomatis setiap login Windows: `powershell -ExecutionPolicy Bypass -File scripts\autostart-ai.ps1`.

Untuk server Linux tersedia skrip `scripts/azure/setup.sh` (systemd + ngrok).

### 3. Frontend (`frontend`)

```bash
cd frontend
npm ci
copy ..\.env.example .env.local   # isi nilainya
npm run dev                       # http://localhost:3000
```

**Deploy ke Vercel:** set **Root Directory** ke `frontend`, isi variabel lingkungan, dan pilih **Function Region** yang sama dengan Supabase (misalnya Singapore `sin1`).

### 4. Pengujian

```bash
cd frontend && npm run typecheck && npm run lint && npm test     # 101 unit test
cd ai-service && ruff check . && pytest -q
cd supabase/tests && npm ci && npm test                          # migrasi + RLS
```

---

## Variabel lingkungan

Contoh lengkap ada di [`.env.example`](.env.example) dan [`ai-service/ai.env.example`](ai-service/ai.env.example).

**Frontend (Vercel)**

| Variabel | Keterangan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key Supabase |
| `NEXT_PUBLIC_APP_URL` | URL aplikasi, misalnya `https://login-masuk.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key Supabase, hanya di server (jangan diberi awalan `NEXT_PUBLIC_`) |
| `AI_SERVICE_URL` | Alamat ai-service, misalnya alamat ngrok |
| `AI_SERVICE_SECRET` | Minimal 24 karakter, sama dengan `AILOKAL_SERVICE_SECRET` |
| `GENERATION_DAILY_LIMIT`, `GENERATION_QUEUE_CAP`, `RATE_LIMIT_*`, `RETENTION_DAYS` | Opsional, ada nilai bawaan |

**Layanan AI (`ai-service/ai.env`)**

| Variabel | Keterangan |
|---|---|
| `AILOKAL_SERVICE_SECRET` | Rahasia bersama dengan frontend |
| `AILOKAL_SUPABASE_URL`, `AILOKAL_SUPABASE_SERVICE_KEY` | Untuk menyimpan progres job dan berkas GLB |
| `AILOKAL_ALLOW_CPU_RECONSTRUCTION` | `true` bila tidak ada GPU NVIDIA |
| `NGROK_DOMAIN` | Dev domain ngrok (opsional, untuk alamat tetap) |

Berkas `ai.env` dan `.env.local` tidak pernah di-commit.

---

## Dokumentasi penggunaan AI

### AI di dalam produk

Semua model open-source dan berjalan di ai-service milik tim, tanpa API berbayar.

| Model | Lisensi | Dipakai untuk |
|---|---|---|
| **TripoSR** (Stability AI & VAST) | MIT | Membuat model 3D dari satu foto |
| **ISNet / DIS** | Apache-2.0 | Memisahkan produk dari latar, menghitung jumlah benda, mendeteksi produk terpotong |
| **YOLOX-s** | Apache-2.0 | Mendeteksi orang, hewan, dan benda lain |
| **MediaPipe** (hand, face, pose) | Apache-2.0 | Mendeteksi tangan, wajah, dan bagian tubuh |
| **OpenCLIP ViT-B-32** | MIT | Mengenali kategori produk dan memilih ukuran perkiraan |

Batasan yang disampaikan ke pengguna: model adalah perkiraan, sisi belakang produk ditebak oleh AI, warna dalam mode CPU lebih polos, dan foto berisi orang selalu ditolak demi privasi. Rinciannya ada di halaman **Transparansi AI** di aplikasi.

### AI dalam proses pengembangan

- **Claude (Anthropic)** dipakai sebagai asisten pemrograman untuk menulis dan meninjau sebagian besar kode (frontend, ai-service, migrasi database, pengujian), mendiagnosis error instalasi, menyusun dokumentasi, dan menyarankan desain antarmuka.

Tim meninjau, menjalankan, menguji, dan bertanggung jawab penuh atas seluruh kode, keamanan, dan fungsi aplikasi, termasuk kode yang dibantu AI.

---

## Atribusi

Daftar lengkap beserta versi dan lisensi ada di [`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md).

| Jenis | Sumber |
|---|---|
| Kode pihak ketiga yang disertakan | TripoSR (MIT) di `ai-service/third_party/triposr`, dengan lisensi asli dan catatan perubahan |
| Bobot model | TripoSR, ISNet (via rembg), YOLOX-s, MediaPipe, OpenCLIP |
| Library | Next.js, React, Tailwind CSS, Supabase, Zod, sharp, model-viewer, FastAPI, PyTorch, OpenCV, trimesh, dan lainnya (MIT/Apache-2.0/BSD) |
| Font | Plus Jakarta Sans (Tokotype, SIL OFL 1.1), Bricolage Grotesque (Mathieu Triay, SIL OFL 1.1) |
| Ilustrasi | Gambar tas, vas, dan sepatu di halaman Beranda dibuat sendiri oleh tim sebagai SVG di `frontend/src/components/illustrations.tsx` |
| Data uji | Contoh gambar dari repositori TripoSR (MIT) dan gambar sintetis buatan tim |

Tidak ada template UI pihak ketiga. AR-LOKAL tidak berafiliasi dengan Shopee atau Tokopedia.

---

## Keterbatasan

- Satu foto tidak bisa memperlihatkan sisi belakang produk; bentuk belakang ditebak oleh AI.
- Pakaian, perhiasan mengilap, dan benda transparan sering menghasilkan model yang kurang baik.
- Layanan AI berjalan di laptop tim, sehingga pembuatan model baru hanya tersedia pada jam aktif. Model yang sudah jadi tetap bisa dilihat kapan saja.
- AR membutuhkan HP dengan ARCore (Android) atau ARKit (iPhone/iPad).

Dokumentasi teknis lain: [Arsitektur](docs/ARCHITECTURE.md), [Keamanan](docs/SECURITY.md), [Keputusan desain](docs/DECISIONS.md), [Perangkat keras](docs/HARDWARE.md), [Laporan uji](docs/TEST_REPORT.md).
