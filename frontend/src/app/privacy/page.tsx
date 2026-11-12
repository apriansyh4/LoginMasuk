import { getLang } from '@/lib/i18n/server';

export const metadata = { title: 'Privacy' };

const CONTENT = {
  id: {
    title: 'Pemberitahuan Privasi',
    sections: [
      [
        'Data yang kami kumpulkan',
        'Hanya email, nama tampilan, waktu persetujuan, dan konten yang Anda kirim (gambar produk, tautan marketplace, ukuran opsional, hasil validasi, dan model 3D). Tidak ada pelacakan atau iklan.',
      ],
      [
        'Untuk apa',
        'Untuk memvalidasi gambar Anda, membuat model 3D perkiraan, dan menampilkan riwayat Anda. Gambar tidak dipakai untuk melatih model AI.',
      ],
      [
        'Orang dan wajah',
        'Gambar yang berisi orang atau bagian tubuh ditolak sejak awal. Kami tidak menyimpan data wajah atau biometrik.',
      ],
      [
        'Penyimpanan',
        'File disimpan di bucket privat dan hanya diakses lewat URL bertanda tangan yang singkat. Unggahan dihapus otomatis setelah masa retensi (bawaan 30 hari). Menghapus kiriman juga menghapus filenya.',
      ],
      [
        'Akses admin',
        'Admin dapat melihat konten pengguna hanya untuk moderasi dan penanganan penyalahgunaan. Setiap tindakan admin dicatat di log audit.',
      ],
      ['Hak Anda', 'Anda dapat melihat, menghapus, dan (mulai Milestone 4) mengekspor data serta menghapus akun Anda.'],
      [
        'Dasar hukum',
        'Pemberitahuan ini disusun selaras secara prinsip dengan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi. Ini bukan nasihat hukum.',
      ],
    ],
  },
  en: {
    title: 'Privacy Notice',
    sections: [
      [
        'What we collect',
        'Only your email, display name, consent time and the content you submit (product images, marketplace links, optional size, validation results and 3D models). No tracking or advertising.',
      ],
      [
        'Why',
        'To validate your images, create approximate 3D models and show your history. Images are not used to train AI models.',
      ],
      ['People and faces', 'Images containing people or body parts are rejected by design. We store no face or biometric data.'],
      [
        'Storage',
        'Files live in private buckets and are only reachable through short-lived signed URLs. Uploads are deleted automatically after the retention period (default 30 days). Deleting a submission deletes its files.',
      ],
      [
        'Admin access',
        'Admins can see user content only for moderation and abuse handling. Every admin action is written to an audit log.',
      ],
      ['Your rights', 'You can view and delete your data, and (from Milestone 4) export it and delete your account.'],
      [
        'Legal basis',
        "This notice is aligned in principle with Indonesia's Personal Data Protection Law (UU No. 27/2022). It is not legal advice.",
      ],
    ],
  },
};

export default async function PrivacyPage() {
  const c = CONTENT[await getLang()];
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl font-semibold">{c.title}</h1>
      {c.sections.map(([h, p]) => (
        <section key={h} className="mt-8">
          <h2 className="font-display text-xl font-semibold">{h}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{p}</p>
        </section>
      ))}
    </article>
  );
}
