/** Flat product drawings used on the landing page (decorative examples, not real models). */

type Props = { className?: string; label?: string };

function a11y(label?: string) {
  return label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
}

export function BagArt({
  className,
  label,
  body = '#e2ae62',
  rim = '#c18c43',
  weave = '#b57f3a',
}: Props & { body?: string; rim?: string; weave?: string }) {
  return (
    <svg viewBox="0 0 190 210" className={className} {...a11y(label)}>
      <path d="M58 70 C58 22, 132 22, 132 70" fill="none" stroke="#6e4325" strokeWidth="9" strokeLinecap="round" />
      <path d="M30 74 H160 L172 190 Q172 204 158 204 H32 Q18 204 18 190 Z" fill={body} />
      <path d="M30 74 H160 L163 100 H27 Z" fill={rim} />
      <g stroke={weave} strokeWidth="2">
        <path d="M24 120 H166" />
        <path d="M22 140 H168" />
        <path d="M21 160 H169" />
        <path d="M20 180 H170" />
        <path d="M50 100 L46 204" />
        <path d="M75 100 L73 204" />
        <path d="M100 100 V204" />
        <path d="M125 100 L127 204" />
        <path d="M150 100 L154 204" />
      </g>
      <rect x="84" y="94" width="22" height="14" rx="4" fill="#6e4325" />
    </svg>
  );
}

export function BagWireframe({ className, label }: Props) {
  return (
    <svg viewBox="0 0 190 210" className={className} {...a11y(label)}>
      <g fill="none" stroke="#34d1bf" strokeWidth="2">
        <path d="M58 70 C58 22, 132 22, 132 70" />
        <path d="M30 74 H160 L172 190 Q172 204 158 204 H32 Q18 204 18 190 Z" />
        <path d="M27 100 H163" />
        <path d="M24 130 H166" />
        <path d="M21 160 H169" />
        <path d="M60 74 L52 204" />
        <path d="M95 74 V204" />
        <path d="M130 74 L138 204" />
        <path d="M30 74 L60 100 L95 74 L130 100 L160 74" />
        <path d="M27 100 L52 130 L95 100 L138 130 L163 100" />
        <path d="M24 130 L52 160 L95 130 L138 160 L166 130" />
      </g>
    </svg>
  );
}

export function VaseArt({ className, label }: Props) {
  return (
    <svg viewBox="0 0 130 200" className={className} {...a11y(label)}>
      <path
        d="M45 8 H85 V30 C85 44, 120 62, 120 112 C120 162, 96 196, 65 196 C34 196, 10 162, 10 112 C10 62, 45 44, 45 30 Z"
        fill="#9e3f22"
      />
      <path d="M45 8 H85 V18 H45 Z" fill="#7a2e16" />
      <path d="M16 100 C40 112, 90 112, 114 100" fill="none" stroke="#ffd9b5" strokeWidth="5" />
      <path d="M14 124 C40 136, 90 136, 116 124" fill="none" stroke="#7a2e16" strokeWidth="4" />
      <path d="M30 150 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10 l10 -10" fill="none" stroke="#ffd9b5" strokeWidth="3" />
    </svg>
  );
}

export function ShoeArt({ className, label }: Props) {
  return (
    <svg viewBox="0 0 220 120" className={className} {...a11y(label)}>
      <path
        d="M14 92 C14 70, 30 58, 52 54 L92 22 C100 16, 112 18, 116 26 L128 48 C150 54, 196 60, 206 80 C210 90, 206 100, 194 100 H24 C18 100, 14 98, 14 92 Z"
        fill="#6a3a20"
      />
      <path d="M14 96 H206 V108 Q206 112 202 112 H18 Q14 112 14 108 Z" fill="#14132e" />
      <path d="M96 30 L120 58" stroke="#f6e2c8" strokeWidth="3" strokeDasharray="4 5" />
      <path d="M60 56 C80 50, 110 52, 128 48" fill="none" stroke="#4a2614" strokeWidth="3" />
    </svg>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path d="M60 0 L70 50 L120 60 L70 70 L60 120 L50 70 L0 60 L50 50 Z" fill="currentColor" />
    </svg>
  );
}
