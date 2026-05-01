import React from 'react';

// Actual Matrix logo paths traced from Matrix_logo_black_outline.svg
// viewBox is 0 0 2256 1202 (aspect ratio ~1.88:1)
const MATRIX_LOGO = {
  viewBox: "0 0 2256 1202",
  mainPath: "M36 1199.2 c-17.1 -4.5 -30.8 -18.8 -34 -35.7 -0.8 -4.4 -1 -75 -0.8 -266 l0.3 -260 3.3 -9.5 c4 -11.5 10.6 -22.3 18.1 -29.9 5.6 -5.6 778.3 -585.2 787.1 -590.3 7 -4.1 16.1 -6.1 25 -5.5 19 1.3 34.9 13.6 41.1 31.7 l2.2 6.5 0.8 239.5 c0.5 140.3 1.3 241.8 1.8 245.2 2.3 13.5 12.2 26.1 25.7 32.5 7.8 3.7 8.1 3.8 19.9 3.8 11.4 0 12.3 -0.2 18.5 -3.1 3.8 -1.8 30.2 -20.7 64.5 -46.1 31.9 -23.6 197.5 -146.4 368 -272.9 181 -134.2 312.7 -231.2 316.5 -233.1 14.7 -7.4 31.1 -6.1 45.8 3.5 7 4.6 11.7 10.2 16.1 19.2 l3.6 7.5 0.6 56 c0.4 30.8 1 146 1.3 256 0.5 129.9 1.1 201.9 1.8 205.5 2.4 12.9 12.6 27.8 23.9 35.1 2.8 1.7 8 4.4 11.7 5.8 l6.7 2.6 193 0.5 c182.3 0.5 193.3 0.7 199 2.4 27.8 8.4 47.4 28.1 55.2 55.7 1.7 6.1 1.8 16.8 1.8 241.9 0 264.2 0.7 239.6 -7.4 256.5 -9.3 19.4 -24.4 32.7 -45.6 40.2 l-8 2.8 -186 0 -186 0 -8.8 -3.1 c-28.6 -10.3 -48 -34.1 -51.7 -63.8 -1.6 -12.8 -1.4 -382.3 0.3 -382.9 0.9 -0.4 0.9 -0.6 0 -0.6 -1 -0.1 -1.3 -6.6 -1.3 -28.9 0 -31.8 -0.5 -35.7 -6.2 -46.6 -4.1 -7.7 -14.5 -18.2 -22.3 -22.3 -17 -8.9 -37 -9.1 -53 -0.4 -2.7 1.5 -166.1 124.2 -363 272.6 -196.9 148.5 -360.4 271.4 -363.4 273.2 -7.8 4.7 -18.6 6.9 -27.8 5.6 -20 -2.9 -36.8 -18.3 -40.3 -37.2 -0.7 -3.5 -1 -90 -1 -249 0 -266.9 0.4 -249.6 -5.7 -260.1 -12.5 -21.4 -39.4 -29.9 -60.8 -19.3 -10.9 5.5 -98.7 71.1 -414.5 309.8 -181.2 136.9 -332 250.2 -335 251.7 -9.8 4.9 -19.9 5.9 -31 3z",
  circle1: "M1515.5 1196.4 c-30.2 -4.3 -51 -11.8 -73.2 -26.6 -13.6 -9 -33.2 -28.3 -42 -41.3 -33.3 -49.4 -37.2 -110.3 -10.2 -162.5 14.9 -28.8 39.1 -53 67.9 -67.9 45.1 -23.3 97.8 -23.8 142.7 -1.3 16.6 8.4 27.6 16.4 41.4 30.1 23.6 23.7 37.6 49.8 44.1 82.6 2.9 14.3 3.1 42.2 0.5 56 -6.3 33.6 -21 61.6 -44.6 85 -23.8 23.6 -51.3 38 -84.3 44.1 -8 1.5 -36.2 2.7 -42.3 1.8z",
  circle2: "M1983.5 515.5 c-45.6 -7.3 -86.1 -34.1 -110.3 -73 -36.1 -58.2 -30.8 -132.3 13.2 -185 22.7 -27.2 53.8 -45.8 90 -53.7 8.7 -2 13.1 -2.3 31.6 -2.2 18.4 0 22.9 0.3 31.3 2.2 21.9 4.9 42.6 13.9 59.7 26 11.9 8.4 29.6 26 37.7 37.5 12.7 18.1 22.8 42.1 26.9 64.2 2.8 14.9 2.6 42.1 -0.4 57.2 -13 65.1 -64.2 115.3 -128.7 126.3 -13.7 2.3 -38.1 2.6 -51 0.5z",
};

interface AnimatedLogoProps {
  size?: number;
  className?: string;
}

const InsetShadowFilter: React.FC<{ id: string }> = ({ id }) => (
  <filter id={`inset-${id}`} x="-15%" y="-15%" width="130%" height="130%">
    <feComponentTransfer in="SourceAlpha" result="invertAlpha">
      <feFuncA type="table" tableValues="1 0" />
    </feComponentTransfer>
    <feGaussianBlur in="invertAlpha" stdDeviation="60" result="blur" />
    <feOffset in="blur" dx="0" dy="80" result="offsetBlur" />
    <feFlood floodColor="#000000" floodOpacity="0.7" result="shadowColor" />
    <feComposite in="shadowColor" in2="offsetBlur" operator="in" result="shadow" />
    <feComposite in="shadow" in2="SourceAlpha" operator="in" result="innerShadow" />
    <feMerge>
      <feMergeNode in="SourceGraphic" />
      <feMergeNode in="innerShadow" />
    </feMerge>
  </filter>
);

/**
 * Variant 1: Gradient Shift - Diagonal gradient with smooth color cycling
 */
export const LogoGradientShift: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981">
              <animate attributeName="stop-color" values="#10b981;#3b82f6;#06b6d4;#10b981" dur="12s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#3b82f6">
              <animate attributeName="stop-color" values="#3b82f6;#06b6d4;#10b981;#3b82f6" dur="12s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#06b6d4">
              <animate attributeName="stop-color" values="#06b6d4;#10b981;#3b82f6;#06b6d4" dur="12s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#grad-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#grad-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#grad-${id})`} />
        </g>
      </svg>
    </div>
  );
};

/**
 * Variant 2: Gradient Wave - Horizontal gradient moving across
 */
export const LogoGradientWave: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient-wave ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`wave-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981">
              <animate attributeName="offset" values="-1;0;1" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#3b82f6">
              <animate attributeName="offset" values="-0.5;0.5;1.5" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#10b981">
              <animate attributeName="offset" values="0;1;2" dur="3s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#wave-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#wave-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#wave-${id})`} />
        </g>
      </svg>
    </div>
  );
};

/**
 * Variant 3: Gradient Pulse - Radial gradient pulsing from center
 */
export const LogoGradientPulse: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient-pulse ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id={`pulse-${id}`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#10b981">
              <animate attributeName="stop-color" values="#10b981;#22d3ee;#10b981" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#059669">
              <animate attributeName="stop-color" values="#059669;#0891b2;#059669" dur="3s" repeatCount="indefinite" />
            </stop>
            <animate attributeName="r" values="50%;80%;50%" dur="3s" repeatCount="indefinite" />
          </radialGradient>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#pulse-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#pulse-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#pulse-${id})`} />
        </g>
      </svg>
    </div>
  );
};

/**
 * Variant 4: Gradient Sweep - Angular/conic-style rotating gradient
 */
export const LogoGradientSweep: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient-sweep ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`sweep-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="25%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="75%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#10b981" />
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              values="0 0.5 0.5;360 0.5 0.5"
              dur="4s"
              repeatCount="indefinite"
            />
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#sweep-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#sweep-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#sweep-${id})`} />
        </g>
      </svg>
    </div>
  );
};

/**
 * Variant 5: Gradient Breathe - Gradient with subtle brightness pulse
 */
export const LogoGradientBreathe: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient-breathe ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`breathe-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981">
              <animate attributeName="stop-color" values="#10b981;#34d399;#10b981" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#047857">
              <animate attributeName="stop-color" values="#047857;#10b981;#047857" dur="4s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <filter id={`breatheGlow-${id}`}>
            <feGaussianBlur stdDeviation="0" result="blur">
              <animate attributeName="stdDeviation" values="0;15;0" dur="4s" repeatCount="indefinite" />
            </feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <g filter={`url(#breatheGlow-${id})`}>
            <path d={MATRIX_LOGO.mainPath} fill={`url(#breathe-${id})`} />
            <path d={MATRIX_LOGO.circle1} fill={`url(#breathe-${id})`} />
            <path d={MATRIX_LOGO.circle2} fill={`url(#breathe-${id})`} />
          </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Variant 6: Gradient Split - Two-tone gradient that shifts positions
 */
export const LogoGradientSplit: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient-split ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`split-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#10b981">
              <animate attributeName="offset" values="0.3;0.7;0.3" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#3b82f6">
              <animate attributeName="offset" values="0.3;0.7;0.3" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#split-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#split-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#split-${id})`} />
        </g>
      </svg>
    </div>
  );
};

/**
 * Variant 7: Gradient Shimmer - Fast subtle highlight sweep
 */
export const LogoGradientShimmer: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient-shimmer ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`shimmer-base-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id={`shimmer-${id}`} x1="-100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="40%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="transparent" />
            <animate attributeName="x1" values="-100%;100%" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="x2" values="0%;200%" dur="2.5s" repeatCount="indefinite" />
          </linearGradient>
          <clipPath id={`clip-${id}`}>
            <path d={MATRIX_LOGO.mainPath} />
            <path d={MATRIX_LOGO.circle1} />
            <path d={MATRIX_LOGO.circle2} />
          </clipPath>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#shimmer-base-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#shimmer-base-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#shimmer-base-${id})`} />
          <g clipPath={`url(#clip-${id})`}>
            <rect x="0" y="0" width="2256" height="1202" fill={`url(#shimmer-${id})`} />
          </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Variant 8: Gradient Aurora - Northern lights style flowing gradient
 */
export const LogoGradientAurora: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-gradient-aurora ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`aurora-${id}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981">
              <animate attributeName="stop-color" values="#10b981;#06b6d4;#8b5cf6;#10b981" dur="8s" repeatCount="indefinite" />
              <animate attributeName="offset" values="0;0.1;0" dur="5s" repeatCount="indefinite" />
            </stop>
            <stop offset="30%" stopColor="#06b6d4">
              <animate attributeName="stop-color" values="#06b6d4;#8b5cf6;#10b981;#06b6d4" dur="8s" repeatCount="indefinite" />
              <animate attributeName="offset" values="0.3;0.4;0.3" dur="5s" repeatCount="indefinite" />
            </stop>
            <stop offset="60%" stopColor="#8b5cf6">
              <animate attributeName="stop-color" values="#8b5cf6;#10b981;#06b6d4;#8b5cf6" dur="8s" repeatCount="indefinite" />
              <animate attributeName="offset" values="0.6;0.7;0.6" dur="5s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#ec4899">
              <animate attributeName="stop-color" values="#ec4899;#10b981;#06b6d4;#ec4899" dur="8s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#aurora-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#aurora-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#aurora-${id})`} />
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 1: Matrix Rain - Falling code rain clipped inside the logo shape
 */
export const LogoGlitchRain: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  const cols = 30;
  const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ';
  const drops = React.useMemo(() =>
    Array.from({ length: cols }, (_, i) => ({
      x: (i / cols) * 2256 + 30,
      delay: Math.random() * 5,
      speed: 2 + Math.random() * 3,
      text: Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]),
    })), []);

  return (
    <div className={`logo-glitch-rain ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <clipPath id={`rain-clip-${id}`}>
            <path d={MATRIX_LOGO.mainPath} />
            <path d={MATRIX_LOGO.circle1} />
            <path d={MATRIX_LOGO.circle2} />
          </clipPath>
          <filter id={`rain-glow-${id}`} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
          {/* Dark fill base */}
          <path d={MATRIX_LOGO.mainPath} fill="#0a1a0a" />
          <path d={MATRIX_LOGO.circle1} fill="#0a1a0a" />
          <path d={MATRIX_LOGO.circle2} fill="#0a1a0a" />

          {/* Code rain clipped to logo */}
          <g clipPath={`url(#rain-clip-${id})`}>
            {drops.map((drop, i) => (
              <g key={i}>
                {drop.text.map((char, j) => (
                  <text
                    key={j}
                    x={drop.x}
                    y={0}
                    fill={j === 0 ? '#ffffff' : '#00ff41'}
                    fontSize="80"
                    fontFamily="monospace"
                    opacity={j === 0 ? 1 : Math.max(0.15, 1 - j * 0.1)}
                  >
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      values={`0 ${-200 + j * 85};0 ${1500 + j * 85}`}
                      dur={`${drop.speed}s`}
                      begin={`${drop.delay}s`}
                      repeatCount="indefinite"
                    />
                    {char}
                  </text>
                ))}
              </g>
            ))}
          </g>

          {/* Faint green edge glow */}
          <g filter={`url(#rain-glow-${id})`} opacity="0.25">
            <path d={MATRIX_LOGO.mainPath} fill="none" stroke="#00ff41" strokeWidth="8" />
            <path d={MATRIX_LOGO.circle1} fill="none" stroke="#00ff41" strokeWidth="8" />
            <path d={MATRIX_LOGO.circle2} fill="none" stroke="#00ff41" strokeWidth="8" />
          </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 2: RGB Split - Green fill with intermittent red/blue channel separation
 */
export const LogoGlitchRGB: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-rgb ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={`rgb-glow-${id}`} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`rgb-r-${id}`}>
            <feOffset dx="0" dy="0">
              <animate attributeName="dx" values="0;0;0;0;25;0;0;0;0;0;-20;0;0;0;0;0;0;0;30;0" dur="4s" repeatCount="indefinite" />
            </feOffset>
          </filter>
          <filter id={`rgb-b-${id}`}>
            <feOffset dx="0" dy="0">
              <animate attributeName="dx" values="0;0;0;0;-25;0;0;0;0;0;20;0;0;0;0;0;0;0;-30;0" dur="4s" repeatCount="indefinite" />
            </feOffset>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
          {/* Red channel (offset left/right on glitch) */}
          <g filter={`url(#rgb-r-${id})`} opacity="0">
            <path d={MATRIX_LOGO.mainPath} fill="#ff0040" />
            <path d={MATRIX_LOGO.circle1} fill="#ff0040" />
            <path d={MATRIX_LOGO.circle2} fill="#ff0040" />
            <animate attributeName="opacity" values="0;0;0;0;0.5;0;0;0;0;0;0.4;0;0;0;0;0;0;0;0.6;0" dur="4s" repeatCount="indefinite" />
          </g>

          {/* Blue channel (offset opposite) */}
          <g filter={`url(#rgb-b-${id})`} opacity="0">
            <path d={MATRIX_LOGO.mainPath} fill="#0066ff" />
            <path d={MATRIX_LOGO.circle1} fill="#0066ff" />
            <path d={MATRIX_LOGO.circle2} fill="#0066ff" />
            <animate attributeName="opacity" values="0;0;0;0;0.5;0;0;0;0;0;0.4;0;0;0;0;0;0;0;0.6;0" dur="4s" repeatCount="indefinite" />
          </g>

          {/* Main green channel */}
          <g filter={`url(#rgb-glow-${id})`}>
            <path d={MATRIX_LOGO.mainPath} fill="#00ff41">
              <animate attributeName="opacity" values="1;1;1;1;0.6;1;1;1;1;1;0.7;1;1;1;1;1;1;1;0.5;1" dur="4s" repeatCount="indefinite" />
            </path>
            <path d={MATRIX_LOGO.circle1} fill="#00ff41" />
            <path d={MATRIX_LOGO.circle2} fill="#00ff41" />
          </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 3: Scanline Flicker - Green fill with horizontal scanlines and flicker
 */
export const LogoGlitchScanline: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-scanline ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <pattern id={`scan-${id}`} width="2256" height="12" patternUnits="userSpaceOnUse">
            <rect width="2256" height="6" fill="#00ff41" />
            <rect y="6" width="2256" height="6" fill="#00cc33" />
          </pattern>
          <pattern id={`scanover-${id}`} width="2256" height="24" patternUnits="userSpaceOnUse">
            <rect width="2256" height="12" fill="transparent" />
            <rect y="12" width="2256" height="12" fill="rgba(0,0,0,0.35)" />
          </pattern>
          <clipPath id={`scan-clip-${id}`}>
            <path d={MATRIX_LOGO.mainPath} />
            <path d={MATRIX_LOGO.circle1} />
            <path d={MATRIX_LOGO.circle2} />
          </clipPath>
          <filter id={`scan-glow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
          {/* Base green fill with scanline pattern */}
          <g filter={`url(#scan-glow-${id})`}>
            <path d={MATRIX_LOGO.mainPath} fill={`url(#scan-${id})`}>
              <animate attributeName="opacity" values="1;1;0.85;1;0.9;1;1;0.7;1;1;1;0.95;1" dur="3s" repeatCount="indefinite" />
            </path>
            <path d={MATRIX_LOGO.circle1} fill={`url(#scan-${id})`}>
              <animate attributeName="opacity" values="1;0.9;1;1;0.8;1;1;1" dur="2s" repeatCount="indefinite" />
            </path>
            <path d={MATRIX_LOGO.circle2} fill={`url(#scan-${id})`}>
              <animate attributeName="opacity" values="1;1;0.85;1;1;0.75;1;1" dur="2.3s" repeatCount="indefinite" />
            </path>
          </g>

          {/* Darker scanline overlay for CRT effect */}
          <g clipPath={`url(#scan-clip-${id})`}>
            <rect x="0" y="0" width="2256" height="1202" fill={`url(#scanover-${id})`} opacity="0.6">
              <animateTransform attributeName="transform" type="translate" values="0 0;0 12;0 0" dur="0.08s" repeatCount="indefinite" />
            </rect>
          </g>

          {/* Random horizontal glitch bars */}
          <g clipPath={`url(#scan-clip-${id})`}>
            <rect x="-30" y="300" width="2316" height="50" fill="#00ff41" opacity="0">
              <animate attributeName="opacity" values="0;0;0;0;0;0.4;0;0;0;0;0;0;0;0.3;0;0;0;0" dur="3s" repeatCount="indefinite" />
              <animate attributeName="y" values="300;100;700;500;200;900;400;800;150;600" dur="3s" repeatCount="indefinite" />
              <animate attributeName="height" values="50;30;80;20;60;40;70;25;55;35" dur="3s" repeatCount="indefinite" />
            </rect>
          </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 4: Neon Pulse - Bright neon green outline that pulses with inner glow
 */
export const LogoGlitchNeon: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-neon ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={`neon-inner-${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`neon-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00ff41">
              <animate attributeName="stop-color" values="#00ff41;#39ff14;#00e639;#00ff41" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#00cc33">
              <animate attributeName="stop-color" values="#00cc33;#00ff41;#39ff14;#00cc33" dur="3s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
          {/* Very dim fill */}
          <path d={MATRIX_LOGO.mainPath} fill="#002a00" />
          <path d={MATRIX_LOGO.circle1} fill="#002a00" />
          <path d={MATRIX_LOGO.circle2} fill="#002a00" />

          {/* Neon glow fill */}
          <g filter={`url(#neon-inner-${id})`}>
            <path d={MATRIX_LOGO.mainPath} fill={`url(#neon-grad-${id})`} opacity="0.3">
              <animate attributeName="opacity" values="0.3;0.5;0.3;0.2;0.4;0.3" dur="4s" repeatCount="indefinite" />
            </path>
            <path d={MATRIX_LOGO.circle1} fill={`url(#neon-grad-${id})`} opacity="0.3">
              <animate attributeName="opacity" values="0.3;0.4;0.2;0.5;0.3" dur="3s" repeatCount="indefinite" />
            </path>
            <path d={MATRIX_LOGO.circle2} fill={`url(#neon-grad-${id})`} opacity="0.3">
              <animate attributeName="opacity" values="0.2;0.3;0.5;0.3;0.4;0.2" dur="3.5s" repeatCount="indefinite" />
            </path>
          </g>

        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 5: Data Corrupt - Green gradient with horizontal slice displacement
 */
export const LogoGlitchCorrupt: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-corrupt ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`corrupt-grad-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00ff41" />
            <stop offset="50%" stopColor="#00cc33" />
            <stop offset="100%" stopColor="#009922" />
          </linearGradient>
          <clipPath id={`corrupt-clip-${id}`}>
            <path d={MATRIX_LOGO.mainPath} />
            <path d={MATRIX_LOGO.circle1} />
            <path d={MATRIX_LOGO.circle2} />
          </clipPath>
          <filter id={`corrupt-glow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Slice displacement filters */}
          <filter id={`corrupt-slice1-${id}`}>
            <feOffset dx="0" dy="0">
              <animate attributeName="dx" values="0;0;0;0;0;40;0;0;0;0;0;0;0;-30;0;0;0;0;0;0" dur="5s" repeatCount="indefinite" />
            </feOffset>
          </filter>
          <filter id={`corrupt-slice2-${id}`}>
            <feOffset dx="0" dy="0">
              <animate attributeName="dx" values="0;0;0;0;0;-50;0;0;0;0;0;0;0;35;0;0;0;0;0;0" dur="5s" repeatCount="indefinite" />
            </feOffset>
          </filter>
          <filter id={`corrupt-slice3-${id}`}>
            <feOffset dx="0" dy="0">
              <animate attributeName="dx" values="0;0;0;0;0;0;0;25;0;0;0;0;0;0;0;-45;0;0;0;0" dur="5s" repeatCount="indefinite" />
            </feOffset>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
        {/* Main stable fill */}
        <g filter={`url(#corrupt-glow-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#corrupt-grad-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#corrupt-grad-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#corrupt-grad-${id})`} />
        </g>

        {/* Displaced horizontal slices — each slice is a rect-clipped copy that shifts */}
        <g clipPath={`url(#corrupt-clip-${id})`}>
          {/* Slice 1: top band */}
          <g filter={`url(#corrupt-slice1-${id})`}>
            <rect x="0" y="0" width="2256" height="300" fill={`url(#corrupt-grad-${id})`} opacity="0">
              <animate attributeName="opacity" values="0;0;0;0;0;0.8;0;0;0;0;0;0;0;0.7;0;0;0;0;0;0" dur="5s" repeatCount="indefinite" />
            </rect>
          </g>
          {/* Slice 2: mid band */}
          <g filter={`url(#corrupt-slice2-${id})`}>
            <rect x="0" y="450" width="2256" height="200" fill={`url(#corrupt-grad-${id})`} opacity="0">
              <animate attributeName="opacity" values="0;0;0;0;0;0.8;0;0;0;0;0;0;0;0.7;0;0;0;0;0;0" dur="5s" repeatCount="indefinite" />
            </rect>
          </g>
          {/* Slice 3: lower band */}
          <g filter={`url(#corrupt-slice3-${id})`}>
            <rect x="0" y="800" width="2256" height="250" fill={`url(#corrupt-grad-${id})`} opacity="0">
              <animate attributeName="opacity" values="0;0;0;0;0;0;0;0.8;0;0;0;0;0;0;0;0.7;0;0;0;0" dur="5s" repeatCount="indefinite" />
            </rect>
          </g>
        </g>

        {/* Brief white flash on glitch */}
        <g clipPath={`url(#corrupt-clip-${id})`}>
          <rect x="0" y="0" width="2256" height="1202" fill="#ffffff" opacity="0">
            <animate attributeName="opacity" values="0;0;0;0;0;0.15;0;0;0;0;0;0;0;0.1;0;0;0;0;0;0" dur="5s" repeatCount="indefinite" />
          </rect>
        </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 6: Seizure Strobe - Rapid green/black strobing with horizontal tearing
 */
export const LogoGlitchStrobe: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-strobe ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <clipPath id={`strobe-clip-${id}`}>
            <path d={MATRIX_LOGO.mainPath} />
            <path d={MATRIX_LOGO.circle1} />
            <path d={MATRIX_LOGO.circle2} />
          </clipPath>
          <filter id={`strobe-glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Heavy displacement */}
          <filter id={`strobe-tear-${id}`}>
            <feOffset dx="0" dy="0">
              <animate attributeName="dx" values="0;0;80;0;-60;0;0;100;0;-80;0;0;0;50;0;0;-70;0;0;0" dur="2s" repeatCount="indefinite" />
              <animate attributeName="dy" values="0;0;0;15;0;0;-10;0;0;0;20;0;0;0;-15;0;0;0;0;0" dur="2s" repeatCount="indefinite" />
            </feOffset>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
        {/* Base fill - strobing between green and dark */}
        <g filter={`url(#strobe-glow-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill="#00ff41">
            <animate attributeName="fill" values="#00ff41;#00ff41;#001a00;#00ff41;#00ff41;#002200;#00ff41;#001100;#00ff41;#00ff41" dur="0.8s" repeatCount="indefinite" />
          </path>
          <path d={MATRIX_LOGO.circle1} fill="#00ff41">
            <animate attributeName="fill" values="#00ff41;#001a00;#00ff41;#00ff41;#002200;#00ff41;#00ff41;#001100;#00ff41;#00ff41" dur="0.6s" repeatCount="indefinite" />
          </path>
          <path d={MATRIX_LOGO.circle2} fill="#00ff41">
            <animate attributeName="fill" values="#00ff41;#00ff41;#00ff41;#001a00;#00ff41;#002200;#00ff41;#00ff41;#001100;#00ff41" dur="0.7s" repeatCount="indefinite" />
          </path>
        </g>

        {/* Tear slice that rips across */}
        <g clipPath={`url(#strobe-clip-${id})`}>
          <g filter={`url(#strobe-tear-${id})`}>
            <rect x="0" y="0" width="2256" height="180" fill="#39ff14" opacity="0">
              <animate attributeName="opacity" values="0;0;0.7;0;0;0;0.5;0;0;0;0;0.8;0;0;0;0.6;0;0;0;0" dur="2s" repeatCount="indefinite" />
              <animate attributeName="y" values="100;500;200;800;350;900;150;700;400;600" dur="2s" repeatCount="indefinite" />
            </rect>
          </g>
        </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 7: Static Noise - Animated noise texture clipped inside logo
 */
export const LogoGlitchNoise: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-noise ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <clipPath id={`noise-clip-${id}`}>
            <path d={MATRIX_LOGO.mainPath} />
            <path d={MATRIX_LOGO.circle1} />
            <path d={MATRIX_LOGO.circle2} />
          </clipPath>
          <filter id={`noise-filter-${id}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="1" result="noise">
              <animate attributeName="seed" values="1;20;5;15;8;25;3;18;10;22;1" dur="0.5s" repeatCount="indefinite" />
            </feTurbulence>
            <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
            <feComponentTransfer in="grey" result="highContrast">
              <feFuncR type="discrete" tableValues="0 1" />
              <feFuncG type="discrete" tableValues="0 1" />
              <feFuncB type="discrete" tableValues="0 0.3" />
            </feComponentTransfer>
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" in="highContrast" result="greenNoise" />
            <feBlend in="greenNoise" in2="SourceGraphic" mode="screen" />
          </filter>
          <filter id={`noise-glow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
        {/* Dark base */}
        <path d={MATRIX_LOGO.mainPath} fill="#001a00" />
        <path d={MATRIX_LOGO.circle1} fill="#001a00" />
        <path d={MATRIX_LOGO.circle2} fill="#001a00" />

        {/* Noise overlay clipped to logo */}
        <g clipPath={`url(#noise-clip-${id})`}>
          <rect x="0" y="0" width="2256" height="1202" filter={`url(#noise-filter-${id})`} fill="#003300" opacity="0.9" />
        </g>

        {/* Faint green glow edge */}
        <g filter={`url(#noise-glow-${id})`} opacity="0.3">
          <path d={MATRIX_LOGO.mainPath} fill="none" stroke="#00ff41" strokeWidth="6" />
          <path d={MATRIX_LOGO.circle1} fill="none" stroke="#00ff41" strokeWidth="6" />
          <path d={MATRIX_LOGO.circle2} fill="none" stroke="#00ff41" strokeWidth="6" />
        </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 8: Fragmented - Logo splits into offset fragments that jitter
 */
export const LogoGlitchFragment: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-fragment ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={`frag-glow-${id}`} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Each fragment gets its own clip band */}
          <clipPath id={`frag-top-${id}`}>
            <rect x="-200" y="-100" width="2656" height="450" />
          </clipPath>
          <clipPath id={`frag-mid-${id}`}>
            <rect x="-200" y="350" width="2656" height="400" />
          </clipPath>
          <clipPath id={`frag-bot-${id}`}>
            <rect x="-200" y="750" width="2656" height="552" />
          </clipPath>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
        {/* Top fragment */}
        <g clipPath={`url(#frag-top-${id})`} filter={`url(#frag-glow-${id})`}>
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="0,0;0,0;0,0;0,0;60,0;0,0;0,0;0,0;-40,0;0,0;0,0;0,0;0,0;0,0;80,-5;0,0;0,0;0,0;0,0;0,0"
              dur="4s" repeatCount="indefinite" />
            <path d={MATRIX_LOGO.mainPath} fill="#00ff41" />
            <path d={MATRIX_LOGO.circle1} fill="#00ff41" />
            <path d={MATRIX_LOGO.circle2} fill="#00ff41" />
          </g>
        </g>

        {/* Middle fragment */}
        <g clipPath={`url(#frag-mid-${id})`} filter={`url(#frag-glow-${id})`}>
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="0,0;0,0;0,0;0,0;-80,0;0,0;0,0;0,0;50,0;0,0;0,0;0,0;0,0;0,0;-60,8;0,0;0,0;0,0;0,0;0,0"
              dur="4s" repeatCount="indefinite" />
            <path d={MATRIX_LOGO.mainPath} fill="#00dd38" />
            <path d={MATRIX_LOGO.circle1} fill="#00dd38" />
            <path d={MATRIX_LOGO.circle2} fill="#00dd38" />
          </g>
        </g>

        {/* Bottom fragment */}
        <g clipPath={`url(#frag-bot-${id})`} filter={`url(#frag-glow-${id})`}>
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="0,0;0,0;0,0;0,0;40,0;0,0;0,0;0,0;-70,0;0,0;0,0;0,0;0,0;0,0;90,-3;0,0;0,0;0,0;0,0;0,0"
              dur="4s" repeatCount="indefinite" />
            <path d={MATRIX_LOGO.mainPath} fill="#00bb2e" />
            <path d={MATRIX_LOGO.circle1} fill="#00bb2e" />
            <path d={MATRIX_LOGO.circle2} fill="#00bb2e" />
          </g>
        </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 9: Meltdown - Logo drips/melts downward with displacement
 */
export const LogoGlitchMelt: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-glitch-melt ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={`melt-${id}`} x="-10%" y="-10%" width="120%" height="140%">
            <feTurbulence type="turbulence" baseFrequency="0.015 0.08" numOctaves="3" seed="5" result="warp">
              <animate attributeName="baseFrequency" values="0.015 0.08;0.02 0.12;0.01 0.06;0.025 0.1;0.015 0.08" dur="6s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="0" xChannelSelector="R" yChannelSelector="G">
              <animate attributeName="scale" values="0;0;0;80;120;60;0;0;0;0;0;100;0;0;0" dur="5s" repeatCount="indefinite" />
            </feDisplacementMap>
          </filter>
          <filter id={`melt-glow-${id}`} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`melt-grad-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#39ff14" />
            <stop offset="60%" stopColor="#00ff41" />
            <stop offset="100%" stopColor="#00aa2a" />
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
        <g filter={`url(#melt-${id})`}>
          <g filter={`url(#melt-glow-${id})`}>
            <path d={MATRIX_LOGO.mainPath} fill={`url(#melt-grad-${id})`}>
              <animate attributeName="opacity" values="1;1;1;0.8;0.6;0.8;1;1;1;1;1;0.7;1;1;1" dur="5s" repeatCount="indefinite" />
            </path>
            <path d={MATRIX_LOGO.circle1} fill={`url(#melt-grad-${id})`} />
            <path d={MATRIX_LOGO.circle2} fill={`url(#melt-grad-${id})`} />
          </g>
        </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Glitch 10: Hex Cascade - Binary/hex values cascading through with heavy interference
 */
export const LogoGlitchHex: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = '',
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  const hexChars = '0123456789ABCDEF';
  const cols = 24;
  const cascades = React.useMemo(() =>
    Array.from({ length: cols }, (_, i) => ({
      x: (i / cols) * 2256 + 40,
      delay: Math.random() * 3,
      speed: 0.8 + Math.random() * 1.5,
      text: Array.from({ length: 16 }, () =>
        hexChars[Math.floor(Math.random() * 16)] + hexChars[Math.floor(Math.random() * 16)]
      ),
    })), []);

  return (
    <div className={`logo-glitch-hex ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <clipPath id={`hex-clip-${id}`}>
            <path d={MATRIX_LOGO.mainPath} />
            <path d={MATRIX_LOGO.circle1} />
            <path d={MATRIX_LOGO.circle2} />
          </clipPath>
          <filter id={`hex-glow-${id}`} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Interference bars */}
          <filter id={`hex-interfere-${id}`}>
            <feOffset dx="0" dy="0">
              <animate attributeName="dx" values="0;0;0;100;0;0;-80;0;0;0;60;0;0;0;-90;0;0;0;0;0" dur="3s" repeatCount="indefinite" />
            </feOffset>
          </filter>
          <InsetShadowFilter id={id} />
        </defs>

        <g filter={`url(#inset-${id})`}>
        {/* Black base */}
        <path d={MATRIX_LOGO.mainPath} fill="#0a0a0a" />
        <path d={MATRIX_LOGO.circle1} fill="#0a0a0a" />
        <path d={MATRIX_LOGO.circle2} fill="#0a0a0a" />

        {/* Fast hex cascade clipped inside */}
        <g clipPath={`url(#hex-clip-${id})`}>
          {cascades.map((col, i) => (
            <g key={i}>
              {col.text.map((hex, j) => (
                <text
                  key={j}
                  x={col.x}
                  y={0}
                  fill={j < 2 ? '#ffffff' : '#00ff41'}
                  fontSize="65"
                  fontFamily="monospace"
                  fontWeight="bold"
                  opacity={j < 2 ? 1 : Math.max(0.1, 0.9 - j * 0.06)}
                >
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    values={`0 ${-300 + j * 80};0 ${1600 + j * 80}`}
                    dur={`${col.speed}s`}
                    begin={`${col.delay}s`}
                    repeatCount="indefinite"
                  />
                  {hex}
                </text>
              ))}
            </g>
          ))}
        </g>

        {/* Interference bars */}
        <g clipPath={`url(#hex-clip-${id})`}>
          <g filter={`url(#hex-interfere-${id})`}>
            <rect x="0" y="0" width="2256" height="100" fill="#00ff41" opacity="0">
              <animate attributeName="opacity" values="0;0;0;0.5;0;0;0.4;0;0;0;0.6;0;0;0;0.3;0;0;0;0;0" dur="3s" repeatCount="indefinite" />
              <animate attributeName="y" values="200;700;100;500;900;300;800;400;600;150" dur="3s" repeatCount="indefinite" />
              <animate attributeName="height" values="100;60;140;80;50;120;70;90;110;60" dur="3s" repeatCount="indefinite" />
            </rect>
          </g>
        </g>

        {/* Edge glow */}
        <g filter={`url(#hex-glow-${id})`} opacity="0.2">
          <path d={MATRIX_LOGO.mainPath} fill="none" stroke="#00ff41" strokeWidth="8" />
          <path d={MATRIX_LOGO.circle1} fill="none" stroke="#00ff41" strokeWidth="8" />
          <path d={MATRIX_LOGO.circle2} fill="none" stroke="#00ff41" strokeWidth="8" />
        </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * Static logo for reference/comparison
 */
export const LogoStatic: React.FC<AnimatedLogoProps> = ({
  size = 200,
  className = ''
}) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={`logo-static ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`static-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <InsetShadowFilter id={id} />
        </defs>
        <g filter={`url(#inset-${id})`}>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#static-grad-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#static-grad-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#static-grad-${id})`} />
        </g>
      </svg>
    </div>
  );
};

export { MATRIX_LOGO };
