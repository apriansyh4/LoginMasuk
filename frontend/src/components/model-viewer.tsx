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
        ar?: boolean;
        'ar-modes'?: string;
        'ar-scale'?: string;
        'ar-placement'?: string;
      };
    }
  }
}

export type ArTexts = { button: string; hint: string; unsupported: string; failed: string; iosNote: string };

type ModelViewerElement = HTMLElement & { canActivateAR?: boolean; activateAR?: () => Promise<void> };

/**
 * 3D viewer (client-only) with AR placement.
 * AR order: WebXR (Chrome Android, rendered by model-viewer itself) → Scene Viewer (Android
 * fallback) → Quick Look (iOS; model-viewer converts the GLB to USDZ on the device).
 * The model is exported in metres, so `ar-scale="fixed"` shows it at its estimated real size.
 * The AR button is only shown when the browser reports AR support (`canActivateAR`);
 * otherwise an honest "not available on this device" note is shown.
 */
export function ModelViewer({
  src,
  alt,
  loadingText,
  errorText,
  arTexts,
  vertexColours = false,
}: {
  src: string;
  alt: string;
  loadingText: string;
  errorText: string;
  arTexts?: ArTexts;
  vertexColours?: boolean;
}) {
  const ref = useRef<ModelViewerElement | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [canAR, setCanAR] = useState<boolean | null>(null);
  const [arFailed, setArFailed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

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
    const onLoad = () => setCanAR(Boolean(el.canActivateAR));
    const onArStatus = (e: Event) => {
      if ((e as CustomEvent<{ status: string }>).detail.status === 'failed') setArFailed(true);
    };
    el.addEventListener('progress', onProgress);
    el.addEventListener('error', onError);
    el.addEventListener('load', onLoad);
    el.addEventListener('ar-status', onArStatus);
    return () => {
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('error', onError);
      el.removeEventListener('load', onLoad);
      el.removeEventListener('ar-status', onArStatus);
    };
  }, [ready]);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    queueMicrotask(() => setIsIOS(ios));
  }, []);

  const startAR = () => {
    setArFailed(false);
    ref.current?.activateAR?.().catch(() => setArFailed(true));
  };

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
    <div>
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-ink bg-[radial-gradient(circle_at_50%_58%,rgb(255_194_61/0.32),rgb(255_122_138/0.10)_42%,transparent_68%)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[14%] left-1/2 h-[10%] w-1/2 -translate-x-1/2 rounded-[50%] border-2 border-kunyit/45"
        />
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
            ar={Boolean(arTexts)}
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            style={{ width: '100%', height: '100%', background: 'transparent' }}
          >
            {/* model-viewer would draw its own AR button; we render ours below instead. */}
            <span slot="ar-button" hidden />
          </model-viewer>
        )}
        {(!ready || progress < 1) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4" role="status">
            <p className="text-center text-sm text-lavender">{loadingText}</p>
            <div className="mx-auto mt-2 h-1.5 max-w-xs rounded-full bg-white/15">
              <div
                className="h-1.5 rounded-full bg-kunyit transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {arTexts && canAR !== null && (
        <div className="mt-4 space-y-2">
          {canAR ? (
            <>
              <button type="button" onClick={startAR} className="btn-primary min-h-13 w-full text-base">
                {arTexts.button}
              </button>
              <p className="text-sm text-ink-soft">{arTexts.hint}</p>
              {isIOS && vertexColours && <p className="text-xs text-ink-soft">{arTexts.iosNote}</p>}
            </>
          ) : (
            <p className="text-sm text-ink-soft" data-testid="ar-unsupported">
              {arTexts.unsupported}
            </p>
          )}
          {arFailed && (
            <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
              {arTexts.failed}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
