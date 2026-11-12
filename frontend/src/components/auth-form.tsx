'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import type { FormState } from '@/app/(auth)/actions';

type Field = {
  name: string;
  label: string;
  type: 'email' | 'password' | 'text';
  autoComplete: string;
  hint?: string;
  required?: boolean;
};

export function AuthForm(props: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
  messages: Record<string, string>;
  hidden?: Record<string, string>;
  consent?: { label: string; privacyLabel: string; aiLabel: string };
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(
    props.action,
    props.initialError ? { error: props.initialError } : undefined,
  );
  const error = state?.error ? (props.messages[state.error] ?? props.messages.errorGeneric) : null;
  const ok = state?.ok ? props.messages[state.ok] : null;
  return (
    <form action={formAction} className="space-y-5" noValidate={false}>
      {Object.entries(props.hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {props.fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            required={f.required ?? true}
            className="field"
            aria-describedby={f.hint ? `${f.name}-hint` : undefined}
            {...(f.type === 'password' && f.autoComplete === 'new-password' ? { minLength: 10, maxLength: 128 } : {})}
          />
          {f.hint && (
            <p id={`${f.name}-hint`} className="mt-1.5 text-sm text-ink-soft">
              {f.hint}
            </p>
          )}
        </div>
      ))}
      {props.consent && (
        <div className="flex gap-3 rounded-xl bg-cream p-4">
          <input id="consent" name="consent" type="checkbox" required className="mt-1 size-5 accent-terracotta" />
          <label htmlFor="consent" className="text-sm leading-relaxed">
            {props.consent.label}{' '}
            <Link className="underline" href="/privacy" target="_blank">
              {props.consent.privacyLabel}
            </Link>{' '}
            ·{' '}
            <Link className="underline" href="/ai-transparency" target="_blank">
              {props.consent.aiLabel}
            </Link>
          </label>
        </div>
      )}
      <div aria-live="polite" className="min-h-6 text-sm">
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger">{error}</p>}
        {ok && <p className="rounded-lg bg-sage-soft px-3 py-2 text-ink">{ok}</p>}
      </div>
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? '…' : props.submitLabel}
      </button>
    </form>
  );
}
