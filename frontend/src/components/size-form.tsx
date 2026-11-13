'use client';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

export type SizeTexts = {
  title: string;
  help: string;
  axis: { height: string; width: string; depth: string };
  save: string;
  saving: string;
  saved: string;
  invalid: string;
  error: string;
};

type Axis = 'height' | 'width' | 'depth';

/** Owner-only form: set one real dimension; the model and AR rescale without regenerating. */
export function SizeForm({ productId, bboxM, t }: { productId: string; bboxM: number[]; t: SizeTexts }) {
  const router = useRouter();
  const ids = { axis: useId(), cm: useId() };
  const index: Record<Axis, number> = { width: 0, height: 1, depth: 2 };
  const [axis, setAxis] = useState<Axis>('height');
  const current = bboxM.length === 3 ? Math.round(bboxM[index[axis]]! * 1000) / 10 : null;
  const [cm, setCm] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'invalid'>('idle');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(cm.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0.5 || value > 500) return setState('invalid');
    setState('saving');
    try {
      const r = await fetch(`/api/models/${productId}/size`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ axis, cm: value }),
      });
      if (!r.ok) return setState('error');
      setState('saved');
      setCm('');
      router.refresh(); // new signed URL -> the viewer reloads the rescaled model
    } catch {
      setState('error');
    }
  }

  return (
    <form onSubmit={save} className="rounded-[var(--radius-card)] border-2 border-ink bg-kunyit-soft p-4">
      <p className="font-extrabold">{t.title}</p>
      <p className="mt-1 text-sm text-ink-soft">{t.help}</p>
      <div className="mt-3 grid grid-cols-[1fr_1fr] gap-2">
        <div>
          <label htmlFor={ids.axis} className="mb-1 block text-xs font-bold">
            Sisi
          </label>
          <select
            id={ids.axis}
            className="field py-2.5"
            value={axis}
            onChange={(e) => {
              setAxis(e.target.value as Axis);
              setState('idle');
            }}
          >
            {(['height', 'width', 'depth'] as const).map((a) => (
              <option key={a} value={a}>
                {t.axis[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.cm} className="mb-1 block text-xs font-bold">
            cm
          </label>
          <input
            id={ids.cm}
            inputMode="decimal"
            className="field py-2.5"
            placeholder={current !== null ? String(current).replace('.', ',') : ''}
            value={cm}
            onChange={(e) => {
              setCm(e.target.value);
              setState('idle');
            }}
          />
        </div>
      </div>
      <button type="submit" className="mt-3 btn-primary w-full" disabled={!cm.trim() || state === 'saving'}>
        {state === 'saving' ? t.saving : t.save}
      </button>
      <p aria-live="polite" className="mt-2 text-sm">
        {state === 'saved' && <span className="font-bold text-sage">{t.saved}</span>}
        {state === 'invalid' && <span className="font-bold text-danger">{t.invalid}</span>}
        {state === 'error' && <span className="font-bold text-danger">{t.error}</span>}
      </p>
    </form>
  );
}
