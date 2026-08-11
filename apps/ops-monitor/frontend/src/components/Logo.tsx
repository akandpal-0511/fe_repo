/**
 * Generic mining mark — an original, brand-neutral logo for the demo.
 * A stylised mountain / open-pit bench profile inside a rounded tile, in the
 * app's green. Not derived from any customer branding. Pure inline SVG, so it
 * needs no image asset and stays crisp at any size and in either theme.
 */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Mine Operations Monitor logo"
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient id="mom-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#34c759" />
          <stop offset="100%" stopColor="#0f9d58" />
        </linearGradient>
      </defs>
      {/* Rounded tile */}
      <rect x="0" y="0" width="48" height="48" rx="11" fill="url(#mom-g)" />
      {/* Mountain / mine-bench silhouette */}
      <path
        d="M8 34 L19 17 L25 25 L31 15 L40 34 Z"
        fill="#0b3d24"
        fillOpacity="0.55"
      />
      {/* Open-pit bench terraces */}
      <path
        d="M13 34 h22 M16 30 h16 M19 26 h10"
        stroke="#eafff4"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* Peak highlight */}
      <circle cx="31" cy="15" r="2.1" fill="#eafff4" />
    </svg>
  );
}
