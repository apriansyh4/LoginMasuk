import { getLang } from '@/lib/i18n/server';

export const metadata = { title: 'Transparansi AI' };

const CONTENT = {
  id: {
    title: 'Transparansi AI',
    intro:
      'AR-LOKAL memakai model AI open-source yang berjalan di server kami sendiri. Tidak ada gambar yang dikirim ke layanan AI berbayar pihak ketiga.',
    uses: [
      [
        'Validasi gambar',
        'Segmentasi latar (ISNet), deteksi orang/hewan/objek (YOLOX), deteksi tangan/wajah/pose (MediaPipe), dan metrik kualitas klasik (OpenCV) memastikan hanya satu produk yang utuh dan jelas.',
      ],
      ['Deteksi kategori', 'Klasifikasi zero-shot (OpenCLIP) memastikan produk termasuk kategori yang didukung.'],
      ['Rekonstruksi 3D', 'TripoSR membuat model 3D perkiraan dari satu foto.'],
    ],
    limitsTitle: 'Keterbatasan yang diketahui',
    limits: [
      'Satu foto tidak dapat memperlihatkan sisi belakang atau bagian tersembunyi: bentuk tersebut ditebak oleh AI.',
      'Benda mengkilap, transparan, atau sangat tipis sering menghasilkan model yang kurang akurat.',
      'Ukuran nyata tidak diketahui kecuali Anda memasukkannya.',
      'Patung berbentuk manusia dapat ditolak sebagai "orang" karena kami mengutamakan privasi.',
    ],
  },
};

export default async function AiPage() {
  const c = CONTENT[await getLang()];
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="page-title">{c.title}</h1>
      <p className="mt-4 leading-relaxed text-ink-soft">{c.intro}</p>
      {c.uses.map(([h, p]) => (
        <section key={h} className="mt-8">
          <h2 className="font-display text-xl font-extrabold">{h}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{p}</p>
        </section>
      ))}
      <h2 className="mt-10 font-display text-xl font-extrabold">{c.limitsTitle}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
        {c.limits.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </article>
  );
}
