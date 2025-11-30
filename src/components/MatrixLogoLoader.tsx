import React from 'react';
import { RandomMatrixSpinner } from './MatrixSpinners';

interface MatrixLogoLoaderProps {
  size?: number;
  color?: string;
  glowColor?: string;
  duration?: number;
  strokeWidth?: number;
  className?: string;
}

interface MatrixLogoRacerProps {
  size?: number;
  color?: string;
  trailColor?: string;
  duration?: number;
  strokeWidth?: number;
  className?: string;
}

interface MatrixLoadingOverlayProps {
  message?: string;
  variant?: 'simple' | 'full' | 'racer';
  size?: number;
  transparent?: boolean;
  className?: string;
}

// Actual Matrix logo paths traced from Matrix_logo_black_outline.svg
// viewBox is 0 0 2256 1202 (aspect ratio ~1.88:1)
const MATRIX_LOGO = {
  viewBox: "0 0 2256 1202",
  // Main geometric M shape
  mainPath: "M36 1199.2 c-17.1 -4.5 -30.8 -18.8 -34 -35.7 -0.8 -4.4 -1 -75 -0.8 -266 l0.3 -260 3.3 -9.5 c4 -11.5 10.6 -22.3 18.1 -29.9 5.6 -5.6 778.3 -585.2 787.1 -590.3 7 -4.1 16.1 -6.1 25 -5.5 19 1.3 34.9 13.6 41.1 31.7 l2.2 6.5 0.8 239.5 c0.5 140.3 1.3 241.8 1.8 245.2 2.3 13.5 12.2 26.1 25.7 32.5 7.8 3.7 8.1 3.8 19.9 3.8 11.4 0 12.3 -0.2 18.5 -3.1 3.8 -1.8 30.2 -20.7 64.5 -46.1 31.9 -23.6 197.5 -146.4 368 -272.9 181 -134.2 312.7 -231.2 316.5 -233.1 14.7 -7.4 31.1 -6.1 45.8 3.5 7 4.6 11.7 10.2 16.1 19.2 l3.6 7.5 0.6 56 c0.4 30.8 1 146 1.3 256 0.5 129.9 1.1 201.9 1.8 205.5 2.4 12.9 12.6 27.8 23.9 35.1 2.8 1.7 8 4.4 11.7 5.8 l6.7 2.6 193 0.5 c182.3 0.5 193.3 0.7 199 2.4 27.8 8.4 47.4 28.1 55.2 55.7 1.7 6.1 1.8 16.8 1.8 241.9 0 264.2 0.7 239.6 -7.4 256.5 -9.3 19.4 -24.4 32.7 -45.6 40.2 l-8 2.8 -186 0 -186 0 -8.8 -3.1 c-28.6 -10.3 -48 -34.1 -51.7 -63.8 -1.6 -12.8 -1.4 -382.3 0.3 -382.9 0.9 -0.4 0.9 -0.6 0 -0.6 -1 -0.1 -1.3 -6.6 -1.3 -28.9 0 -31.8 -0.5 -35.7 -6.2 -46.6 -4.1 -7.7 -14.5 -18.2 -22.3 -22.3 -17 -8.9 -37 -9.1 -53 -0.4 -2.7 1.5 -166.1 124.2 -363 272.6 -196.9 148.5 -360.4 271.4 -363.4 273.2 -7.8 4.7 -18.6 6.9 -27.8 5.6 -20 -2.9 -36.8 -18.3 -40.3 -37.2 -0.7 -3.5 -1 -90 -1 -249 0 -266.9 0.4 -249.6 -5.7 -260.1 -12.5 -21.4 -39.4 -29.9 -60.8 -19.3 -10.9 5.5 -98.7 71.1 -414.5 309.8 -181.2 136.9 -332 250.2 -335 251.7 -9.8 4.9 -19.9 5.9 -31 3z",
  // Bottom-right circle (O)
  circle1: "M1515.5 1196.4 c-30.2 -4.3 -51 -11.8 -73.2 -26.6 -13.6 -9 -33.2 -28.3 -42 -41.3 -33.3 -49.4 -37.2 -110.3 -10.2 -162.5 14.9 -28.8 39.1 -53 67.9 -67.9 45.1 -23.3 97.8 -23.8 142.7 -1.3 16.6 8.4 27.6 16.4 41.4 30.1 23.6 23.7 37.6 49.8 44.1 82.6 2.9 14.3 3.1 42.2 0.5 56 -6.3 33.6 -21 61.6 -44.6 85 -23.8 23.6 -51.3 38 -84.3 44.1 -8 1.5 -36.2 2.7 -42.3 1.8z",
  // Top-right circle (O)
  circle2: "M1983.5 515.5 c-45.6 -7.3 -86.1 -34.1 -110.3 -73 -36.1 -58.2 -30.8 -132.3 13.2 -185 22.7 -27.2 53.8 -45.8 90 -53.7 8.7 -2 13.1 -2.3 31.6 -2.2 18.4 0 22.9 0.3 31.3 2.2 21.9 4.9 42.6 13.9 59.7 26 11.9 8.4 29.6 26 37.7 37.5 12.7 18.1 22.8 42.1 26.9 64.2 2.8 14.9 2.6 42.1 -0.4 57.2 -13 65.1 -64.2 115.3 -128.7 126.3 -13.7 2.3 -38.1 2.6 -51 0.5z",
};

/**
 * Matrix Logo Loader - Animated SVG logo with racing light effect
 * Similar to the Supabase loading animation where light traces the logo path
 */
export const MatrixLogoLoader: React.FC<MatrixLogoLoaderProps> = ({
  size = 80,
  color = '#10b981',
  duration = 2,
  strokeWidth = 2.5,
  className = ''
}) => {
  // Matrix "M" path - scaled for 50x50 viewBox
  const continuousPath = "M 4 44 L 4 6 L 25 29 L 46 6 L 46 44";
  const pathLength = 140;

  return (
    <div className={`matrix-logo-loader ${className}`} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 50 50"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background path (dim) */}
        <path
          d={continuousPath}
          stroke={color}
          strokeOpacity="0.15"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Animated tracing path */}
        <path
          d={continuousPath}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#glow)"
          style={{
            strokeDasharray: `20 ${pathLength - 20}`,
            animation: `matrixTrace ${duration}s linear infinite`,
          }}
        />

        {/* Bright dot at the leading edge */}
        <circle r="2" fill={color} filter="url(#glow)">
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            path={continuousPath}
          />
        </circle>
      </svg>

      <style>{`
        @keyframes matrixTrace {
          0% { stroke-dashoffset: ${pathLength}; }
          100% { stroke-dashoffset: -${pathLength}; }
        }
        .matrix-logo-loader {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
};

/**
 * Alternative version with the full Matrix logo traced
 */
export const MatrixLogoLoaderFull: React.FC<MatrixLogoLoaderProps> = ({
  size = 120,
  color = '#10b981',
  duration = 3,
  strokeWidth = 1.5,
  className = ''
}) => {
  const paths = [
    { d: "M 10 80 L 10 20", delay: 0 },
    { d: "M 10 20 L 50 55", delay: 0.3 },
    { d: "M 50 55 L 90 20", delay: 0.6 },
    { d: "M 90 20 L 90 80", delay: 0.9 },
  ];
  const segmentLength = 100;

  return (
    <div className={`matrix-logo-loader-full ${className}`} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="glowFull" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {paths.map((path, index) => (
          <path
            key={`bg-${index}`}
            d={path.d}
            stroke={color}
            strokeOpacity="0.1"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />
        ))}

        {paths.map((path, index) => (
          <path
            key={`anim-${index}`}
            d={path.d}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            filter="url(#glowFull)"
            style={{
              strokeDasharray: segmentLength,
              strokeDashoffset: segmentLength,
              animation: `drawSegment ${duration / 4}s ease-out ${path.delay}s infinite`,
            }}
          />
        ))}
      </svg>

      <style>{`
        @keyframes drawSegment {
          0% { stroke-dashoffset: ${segmentLength}; opacity: 0; }
          10% { opacity: 1; }
          50% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        .matrix-logo-loader-full {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
};

/**
 * Racing light version - uses actual Matrix logo paths
 * Creates a Supabase-style racing light effect around the logo
 */
export const MatrixLogoRacer: React.FC<MatrixLogoRacerProps> = ({
  size = 200,
  color = '#10b981',
  trailColor = '#10b98120',
  duration = 4,
  strokeWidth = 32,
  className = ''
}) => {
  // Calculate height to maintain aspect ratio (2256:1202 ≈ 1.88:1)
  const height = size * (1202 / 2256);

  // Path lengths (approximate for animation timing)
  const mainPathLength = 8000;
  const circlePathLength = 600;
  const lightLength = 1200;
  const trailLength = 2500; // Fading trail behind the light

  // Generate unique ID for this instance
  const instanceId = React.useId().replace(/:/g, '');

  return (
    <div className={`matrix-logo-racer ${className}`} style={{ width: size, height }}>
      <svg
        viewBox={MATRIX_LOGO.viewBox}
        width={size}
        height={height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={`racerGlow-${instanceId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradient for fading trail effect */}
          <linearGradient id={`trailGradient-${instanceId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="60%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Static background - main shape */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke={trailColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Static background - circles */}
        <path
          d={MATRIX_LOGO.circle1}
          stroke={trailColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <path
          d={MATRIX_LOGO.circle2}
          stroke={trailColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Fading trail - main shape */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke={color}
          strokeOpacity="0.4"
          strokeWidth={strokeWidth}
          fill="none"
          className={`racer-trail-main-${instanceId}`}
          style={{
            strokeDasharray: `${trailLength} ${mainPathLength}`,
          }}
        />

        {/* Racing light - main shape */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          filter={`url(#racerGlow-${instanceId})`}
          className={`racer-main-${instanceId}`}
          style={{
            strokeDasharray: `${lightLength} ${mainPathLength}`,
          }}
        />

        {/* Fading trail - circle 1 */}
        <path
          d={MATRIX_LOGO.circle1}
          stroke={color}
          strokeOpacity="0.4"
          strokeWidth={strokeWidth}
          fill="none"
          className={`racer-trail-circle1-${instanceId}`}
          style={{
            strokeDasharray: `${trailLength / 2} ${circlePathLength}`,
          }}
        />

        {/* Racing light - circle 1 */}
        <path
          d={MATRIX_LOGO.circle1}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          filter={`url(#racerGlow-${instanceId})`}
          className={`racer-circle1-${instanceId}`}
          style={{
            strokeDasharray: `${lightLength / 2} ${circlePathLength}`,
          }}
        />

        {/* Fading trail - circle 2 */}
        <path
          d={MATRIX_LOGO.circle2}
          stroke={color}
          strokeOpacity="0.4"
          strokeWidth={strokeWidth}
          fill="none"
          className={`racer-trail-circle2-${instanceId}`}
          style={{
            strokeDasharray: `${trailLength / 2} ${circlePathLength}`,
          }}
        />

        {/* Racing light - circle 2 */}
        <path
          d={MATRIX_LOGO.circle2}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          filter={`url(#racerGlow-${instanceId})`}
          className={`racer-circle2-${instanceId}`}
          style={{
            strokeDasharray: `${lightLength / 2} ${circlePathLength}`,
          }}
        />
      </svg>

      <style>{`
        .racer-main-${instanceId}, .racer-trail-main-${instanceId} {
          animation: raceMain-${instanceId} ${duration}s linear infinite;
        }
        .racer-trail-main-${instanceId} {
          animation-name: raceTrailMain-${instanceId};
        }
        .racer-circle1-${instanceId}, .racer-trail-circle1-${instanceId} {
          animation: raceCircle-${instanceId} ${duration * 0.5}s linear infinite;
        }
        .racer-trail-circle1-${instanceId} {
          animation-name: raceTrailCircle-${instanceId};
        }
        .racer-circle2-${instanceId}, .racer-trail-circle2-${instanceId} {
          animation: raceCircle-${instanceId} ${duration * 0.5}s linear infinite;
          animation-delay: ${duration * 0.25}s;
        }
        .racer-trail-circle2-${instanceId} {
          animation-name: raceTrailCircle-${instanceId};
          animation-delay: ${duration * 0.25}s;
        }
        @keyframes raceMain-${instanceId} {
          0% { stroke-dashoffset: 0; }
          20% { stroke-dashoffset: -${(mainPathLength + lightLength) * 0.2}; }
          25% { stroke-dashoffset: -${(mainPathLength + lightLength) * 0.28}; }
          45% { stroke-dashoffset: -${(mainPathLength + lightLength) * 0.48}; }
          50% { stroke-dashoffset: -${(mainPathLength + lightLength) * 0.55}; }
          70% { stroke-dashoffset: -${(mainPathLength + lightLength) * 0.73}; }
          75% { stroke-dashoffset: -${(mainPathLength + lightLength) * 0.8}; }
          100% { stroke-dashoffset: -${mainPathLength + lightLength}; }
        }
        @keyframes raceTrailMain-${instanceId} {
          0% { stroke-dashoffset: ${trailLength - lightLength}; }
          20% { stroke-dashoffset: ${trailLength - lightLength - (mainPathLength + trailLength) * 0.2}; }
          25% { stroke-dashoffset: ${trailLength - lightLength - (mainPathLength + trailLength) * 0.28}; }
          45% { stroke-dashoffset: ${trailLength - lightLength - (mainPathLength + trailLength) * 0.48}; }
          50% { stroke-dashoffset: ${trailLength - lightLength - (mainPathLength + trailLength) * 0.55}; }
          70% { stroke-dashoffset: ${trailLength - lightLength - (mainPathLength + trailLength) * 0.73}; }
          75% { stroke-dashoffset: ${trailLength - lightLength - (mainPathLength + trailLength) * 0.8}; }
          100% { stroke-dashoffset: ${trailLength - lightLength - mainPathLength - trailLength}; }
        }
        @keyframes raceCircle-${instanceId} {
          0% { stroke-dashoffset: 0; }
          40% { stroke-dashoffset: -${(circlePathLength + lightLength / 2) * 0.4}; }
          48% { stroke-dashoffset: -${(circlePathLength + lightLength / 2) * 0.52}; }
          100% { stroke-dashoffset: -${circlePathLength + lightLength / 2}; }
        }
        @keyframes raceTrailCircle-${instanceId} {
          0% { stroke-dashoffset: ${trailLength / 2 - lightLength / 2}; }
          40% { stroke-dashoffset: ${trailLength / 2 - lightLength / 2 - (circlePathLength + trailLength / 2) * 0.4}; }
          48% { stroke-dashoffset: ${trailLength / 2 - lightLength / 2 - (circlePathLength + trailLength / 2) * 0.52}; }
          100% { stroke-dashoffset: ${trailLength / 2 - lightLength / 2 - circlePathLength - trailLength / 2}; }
        }
        .matrix-logo-racer {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
};

/**
 * Loading overlay with Matrix logo animation
 */
export const MatrixLoadingOverlay: React.FC<MatrixLoadingOverlayProps> = ({
  message = 'Loading...',
  variant = 'racer',
  size = 80,
  transparent = false,
  className = ''
}) => {
  const loaders = {
    simple: <MatrixLogoLoader size={size} />,
    full: <MatrixLogoLoaderFull size={size} />,
    racer: <RandomMatrixSpinner size={size} />
  };

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 ${className}`}
      style={{
        backgroundColor: transparent ? 'rgba(0, 0, 0, 0.5)' : 'rgba(10, 10, 10, 0.95)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
    >
      <div className="flex flex-col items-center gap-6">
        {loaders[variant]}
        {message && (
          <p className="text-base text-gray-400 font-medium animate-pulse">{message}</p>
        )}
      </div>
    </div>
  );
};

export default MatrixLogoLoader;
