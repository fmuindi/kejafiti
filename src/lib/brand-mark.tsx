// The logo's roof-and-door mark as a standalone element, for generated icons and share
// images (next/og renders a subset of HTML/CSS, so this stays inline-styled).
export const BRAND = { primary: "#DD0031", ink: "#1D252C", cream: "#FCF9F4" };

export function BrandMark({ size, padding = 0.18, rounded = true }: { size: number; padding?: number; rounded?: boolean }) {
  const inner = Math.round(size * (1 - padding * 2));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.cream,
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 28 28">
        <path d="M3 13 14 4l11 9" fill="none" stroke={BRAND.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="11" y="15" width="6" height="9" rx="3" fill={BRAND.primary} />
      </svg>
    </div>
  );
}
