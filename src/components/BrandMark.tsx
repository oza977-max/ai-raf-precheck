// The Counterpoise mark: a beam balanced on an off-centre fulcrum — a small,
// dense square held level against a larger circle. Redrawn as vector shapes
// from the owner's demo end card (2026-10-02) so it stays sharp at any size
// and needs no image file. Decorative only: the wordmark beside it carries
// the name, so the SVG is hidden from assistive technology.
interface BrandMarkProps {
  /** 'on-dark' for the dark header (cream shapes); 'on-light' for cream pages. */
  tone?: 'on-dark' | 'on-light';
  className?: string;
}

const TONES = {
  'on-dark': { ink: '#f5f0e8', gold: '#d3b271' },
  'on-light': { ink: '#1c1b18', gold: '#b8934a' },
} as const;

export default function BrandMark({ tone = 'on-dark', className }: BrandMarkProps) {
  const { ink, gold } = TONES[tone];
  return (
    <svg className={className} viewBox="0 0 66 35" aria-hidden="true" focusable="false">
      <rect x="1.8" y="7.1" width="8.4" height="6.6" fill={gold} />
      <circle cx="57" cy="7.3" r="7.1" fill={ink} />
      <rect x="0.6" y="13.7" width="64.8" height="2.4" fill={ink} />
      <polygon points="46.2,16.6 40.2,30.6 52.2,30.6" fill={ink} />
      <rect x="35.4" y="32.3" width="21.6" height="1.8" fill={ink} />
    </svg>
  );
}
