export const metadata = { title: 'Credits & Attribution' };

const ITEMS: [string, string, string][] = [
  ['TripoSR (VAST-AI-Research & Stability AI)', 'MIT', 'https://github.com/VAST-AI-Research/TripoSR'],
  ['ISNet / DIS (Xuebin Qin et al.), weights via rembg', 'Apache-2.0', 'https://github.com/xuebinqin/DIS'],
  ['YOLOX (Megvii)', 'Apache-2.0', 'https://github.com/Megvii-BaseDetection/YOLOX'],
  ['MediaPipe (Google)', 'Apache-2.0', 'https://github.com/google-ai-edge/mediapipe'],
  ['OpenCLIP (LAION / mlfoundations)', 'MIT', 'https://github.com/mlfoundations/open_clip'],
  ['OpenCV', 'Apache-2.0', 'https://github.com/opencv/opencv'],
  ['model-viewer (Google)', 'Apache-2.0', 'https://github.com/google/model-viewer'],
  ['Next.js (Vercel)', 'MIT', 'https://github.com/vercel/next.js'],
  ['Supabase', 'Apache-2.0', 'https://github.com/supabase/supabase'],
  ['Fraunces (Undercase Type)', 'SIL OFL 1.1', 'https://github.com/undercasetype/Fraunces'],
  ['Inter (Rasmus Andersson)', 'SIL OFL 1.1', 'https://github.com/rsms/inter'],
];

export default function CreditsPage() {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl font-semibold">Credits &amp; Attribution</h1>
      <p className="mt-4 text-ink-soft">
        Full list with versions in <code>docs/ATTRIBUTION.md</code>. Shopee and Tokopedia are named only as neutral text; AR-LOKAL
        is not affiliated with them.
      </p>
      <ul className="mt-8 divide-y divide-sand">
        {ITEMS.map(([name, license, href]) => (
          <li key={name} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo underline">
              {name}
            </a>
            <span className="text-sm text-ink-soft">{license}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
