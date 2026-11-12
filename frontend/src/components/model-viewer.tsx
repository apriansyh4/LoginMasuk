'use client';
import { useEffect, useRef, useState } from 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'shadow-intensity'?: string;
        'shadow-softness'?: string;
        exposure?: string;
        'environment-image'?: string;
        'interaction-prompt'?: string;
      };
    }
  }
}

/**
 * Basic 3D viewer (client-only). Milestone 3 adds reset camera, AR and share.
 * Loading/error states come from model-viewer's own `progress` / `error` events.
 */
export function ModelViewer({
  src,
  alt,
  loadingText,
  errorText,
}: {
  src: string;
  alt: string;
  loadingText: string;
  errorText: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('@google/model-viewer').then(() => !cancelled && setReady(true)).catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onProgress = (e: Event) => setProgress((e as CustomEvent<{ totalProgress: number }>).detail.totalProgress);
    const onError = () => setFailed(true);
    el.addEventListener('progress', onProgress);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('error', onError);
    };
  }, [ready]);

  if (failed) {
    return (
      <div
        role="alert"
        className="flex aspect-square items-center justify-center rounded-[var(--radius-card)] bg-danger-soft p-6 text-sm text-danger"
      >
        {errorText}
      </div>
    );
  }
  return (
    <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-b from-white to-cream">
      {ready && (
        <model-viewer
          ref={ref}
          src={src}
          alt={alt}
          camera-controls
          shadow-intensity="0.7"
          shadow-softness="1"
          exposure="1"
          environment-image="neutral"
          interaction-prompt="auto"
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        />
      )}
      {(!ready || progress < 1) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4" role="status">
          <p className="text-center text-sm text-ink-soft">{loadingText}</p>
          <div className="mx-auto mt-2 h-1.5 max-w-xs rounded-full bg-sand">
            <div
              className="h-1.5 rounded-full bg-terracotta transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
