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
              <animate attributeName="stop-color" values="#10b981;#3b82f6;#8b5cf6;#10b981" dur="6s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#3b82f6">
              <animate attributeName="stop-color" values="#3b82f6;#8b5cf6;#10b981;#3b82f6" dur="6s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#8b5cf6">
              <animate attributeName="stop-color" values="#8b5cf6;#10b981;#3b82f6;#8b5cf6" dur="6s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#grad-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#grad-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#grad-${id})`} />
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
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#wave-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#wave-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#wave-${id})`} />
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
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#pulse-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#pulse-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#pulse-${id})`} />
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
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#sweep-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#sweep-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#sweep-${id})`} />
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
        </defs>
        <g filter={`url(#breatheGlow-${id})`}>
          <path d={MATRIX_LOGO.mainPath} fill={`url(#breathe-${id})`} />
          <path d={MATRIX_LOGO.circle1} fill={`url(#breathe-${id})`} />
          <path d={MATRIX_LOGO.circle2} fill={`url(#breathe-${id})`} />
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
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#split-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#split-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#split-${id})`} />
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
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#shimmer-base-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#shimmer-base-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#shimmer-base-${id})`} />
        <g clipPath={`url(#clip-${id})`}>
          <rect x="0" y="0" width="2256" height="1202" fill={`url(#shimmer-${id})`} />
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
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill={`url(#aurora-${id})`} />
        <path d={MATRIX_LOGO.circle1} fill={`url(#aurora-${id})`} />
        <path d={MATRIX_LOGO.circle2} fill={`url(#aurora-${id})`} />
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

  return (
    <div className={`logo-static ${className}`} style={{ width: size, height, overflow: 'visible' }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="static-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <path d={MATRIX_LOGO.mainPath} fill="url(#static-grad)" />
        <path d={MATRIX_LOGO.circle1} fill="url(#static-grad)" />
        <path d={MATRIX_LOGO.circle2} fill="url(#static-grad)" />
      </svg>
    </div>
  );
};

export { MATRIX_LOGO };
