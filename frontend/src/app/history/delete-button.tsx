'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Two-step inline confirmation (no browser confirm() dialog). */
export function DeleteButton({ id, label, confirmText }: { id: string; label: string; confirmText: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setFailed(false);
    const r = await fetch(`/api/submissions/${id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (r?.status === 204) router.refresh();
    else setFailed(true);
  }

  if (!armed) {
    return (
      <button type="button" className="btn-ghost min-h-9 px-4 text-danger" onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2" role="group" aria-live="polite">
      <p className="text-xs text-ink">{confirmText}</p>
      <div className="flex gap-2">
        <button type="button" className="btn min-h-9 bg-danger px-4 text-white" disabled={busy} onClick={run}>
          {busy ? '…' : label}
        </button>
        <button type="button" className="btn-ghost min-h-9 px-4" onClick={() => setArmed(false)}>
          ✕
        </button>
      </div>
      {failed && <p className="text-xs text-danger">Error</p>}
    </div>
  );
}
