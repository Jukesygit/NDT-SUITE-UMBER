import React from 'react';

// Matrix logo paths
const MATRIX_LOGO = {
  viewBox: "0 0 2256 1202",
  mainPath: "M36 1199.2 c-17.1 -4.5 -30.8 -18.8 -34 -35.7 -0.8 -4.4 -1 -75 -0.8 -266 l0.3 -260 3.3 -9.5 c4 -11.5 10.6 -22.3 18.1 -29.9 5.6 -5.6 778.3 -585.2 787.1 -590.3 7 -4.1 16.1 -6.1 25 -5.5 19 1.3 34.9 13.6 41.1 31.7 l2.2 6.5 0.8 239.5 c0.5 140.3 1.3 241.8 1.8 245.2 2.3 13.5 12.2 26.1 25.7 32.5 7.8 3.7 8.1 3.8 19.9 3.8 11.4 0 12.3 -0.2 18.5 -3.1 3.8 -1.8 30.2 -20.7 64.5 -46.1 31.9 -23.6 197.5 -146.4 368 -272.9 181 -134.2 312.7 -231.2 316.5 -233.1 14.7 -7.4 31.1 -6.1 45.8 3.5 7 4.6 11.7 10.2 16.1 19.2 l3.6 7.5 0.6 56 c0.4 30.8 1 146 1.3 256 0.5 129.9 1.1 201.9 1.8 205.5 2.4 12.9 12.6 27.8 23.9 35.1 2.8 1.7 8 4.4 11.7 5.8 l6.7 2.6 193 0.5 c182.3 0.5 193.3 0.7 199 2.4 27.8 8.4 47.4 28.1 55.2 55.7 1.7 6.1 1.8 16.8 1.8 241.9 0 264.2 0.7 239.6 -7.4 256.5 -9.3 19.4 -24.4 32.7 -45.6 40.2 l-8 2.8 -186 0 -186 0 -8.8 -3.1 c-28.6 -10.3 -48 -34.1 -51.7 -63.8 -1.6 -12.8 -1.4 -382.3 0.3 -382.9 0.9 -0.4 0.9 -0.6 0 -0.6 -1 -0.1 -1.3 -6.6 -1.3 -28.9 0 -31.8 -0.5 -35.7 -6.2 -46.6 -4.1 -7.7 -14.5 -18.2 -22.3 -22.3 -17 -8.9 -37 -9.1 -53 -0.4 -2.7 1.5 -166.1 124.2 -363 272.6 -196.9 148.5 -360.4 271.4 -363.4 273.2 -7.8 4.7 -18.6 6.9 -27.8 5.6 -20 -2.9 -36.8 -18.3 -40.3 -37.2 -0.7 -3.5 -1 -90 -1 -249 0 -266.9 0.4 -249.6 -5.7 -260.1 -12.5 -21.4 -39.4 -29.9 -60.8 -19.3 -10.9 5.5 -98.7 71.1 -414.5 309.8 -181.2 136.9 -332 250.2 -335 251.7 -9.8 4.9 -19.9 5.9 -31 3z",
  circle1: "M1515.5 1196.4 c-30.2 -4.3 -51 -11.8 -73.2 -26.6 -13.6 -9 -33.2 -28.3 -42 -41.3 -33.3 -49.4 -37.2 -110.3 -10.2 -162.5 14.9 -28.8 39.1 -53 67.9 -67.9 45.1 -23.3 97.8 -23.8 142.7 -1.3 16.6 8.4 27.6 16.4 41.4 30.1 23.6 23.7 37.6 49.8 44.1 82.6 2.9 14.3 3.1 42.2 0.5 56 -6.3 33.6 -21 61.6 -44.6 85 -23.8 23.6 -51.3 38 -84.3 44.1 -8 1.5 -36.2 2.7 -42.3 1.8z",
  circle2: "M1983.5 515.5 c-45.6 -7.3 -86.1 -34.1 -110.3 -73 -36.1 -58.2 -30.8 -132.3 13.2 -185 22.7 -27.2 53.8 -45.8 90 -53.7 8.7 -2 13.1 -2.3 31.6 -2.2 18.4 0 22.9 0.3 31.3 2.2 21.9 4.9 42.6 13.9 59.7 26 11.9 8.4 29.6 26 37.7 37.5 12.7 18.1 22.8 42.1 26.9 64.2 2.8 14.9 2.6 42.1 -0.4 57.2 -13 65.1 -64.2 115.3 -128.7 126.3 -13.7 2.3 -38.1 2.6 -51 0.5z",
  // Path lengths for animation calculations
  mainPathLength: 9500,
  circleLength: 820,
};

interface SpinnerProps {
  size?: number;
  className?: string;
}

// Inject keyframes once
const injectStyles = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('matrix-spinner-styles')) return;

  const style = document.createElement('style');
  style.id = 'matrix-spinner-styles';
  style.textContent = `
    /* Racer - Classic racing trail */
    @keyframes spinnerRace {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -9500; }
    }
    @keyframes spinnerCircleRace {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -820; }
    }

    /* Reverse racer */
    @keyframes spinnerRaceReverse {
      0% { stroke-dashoffset: -9500; }
      100% { stroke-dashoffset: 0; }
    }
    @keyframes spinnerCircleRaceReverse {
      0% { stroke-dashoffset: -820; }
      100% { stroke-dashoffset: 0; }
    }

    /* Pulse stroke width */
    @keyframes spinnerPulseWidth {
      0%, 100% { stroke-width: 30; }
      50% { stroke-width: 60; }
    }

    /* Fade in/out */
    @keyframes spinnerFade {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }

    /* Dash grow/shrink */
    @keyframes spinnerDashGrow {
      0% { stroke-dasharray: 1500 8000; }
      50% { stroke-dasharray: 5000 4500; }
      100% { stroke-dasharray: 1500 8000; }
    }

    /* Color shift - Blue theme */
    @keyframes spinnerColorBlue {
      0% { stroke: #3b82f6; }
      33% { stroke: #06b6d4; }
      66% { stroke: #6366f1; }
      100% { stroke: #3b82f6; }
    }

    /* Color shift - Cyan to blue */
    @keyframes spinnerColorCyan {
      0% { stroke: #22d3ee; }
      50% { stroke: #3b82f6; }
      100% { stroke: #22d3ee; }
    }

    /* Color shift - Full spectrum */
    @keyframes spinnerColorSpectrum {
      0% { stroke: #3b82f6; }
      25% { stroke: #8b5cf6; }
      50% { stroke: #06b6d4; }
      75% { stroke: #10b981; }
      100% { stroke: #3b82f6; }
    }

    /* Emerald to cyan */
    @keyframes spinnerColorEmeraldCyan {
      0% { stroke: #10b981; }
      50% { stroke: #06b6d4; }
      100% { stroke: #10b981; }
    }

    /* Stagger delay for circles */
    @keyframes spinnerCircle1Race {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -820; }
    }
    @keyframes spinnerCircle2Race {
      0% { stroke-dashoffset: -410; }
      100% { stroke-dashoffset: -1230; }
    }
  `;
  document.head.appendChild(style);
};

// Initialize styles
if (typeof window !== 'undefined') {
  injectStyles();
}

/**
 * 1. Classic Racer - Original sync button style (emerald)
 */
export const SpinnerClassic: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#10b98125" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#10b98125" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#10b98125" strokeWidth="50" fill="none" />

        {/* Racing trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="4500 5000"
          style={{ animation: 'spinnerRace 3s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite', animationDelay: '0.75s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 2. Ocean Blue - Blue theme racer
 */
export const SpinnerOcean: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#3b82f620" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#3b82f620" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#3b82f620" strokeWidth="50" fill="none" />

        {/* Racing trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="4000 5500"
          style={{ animation: 'spinnerRace 2.5s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="500 320"
          style={{ animation: 'spinnerCircleRace 1.2s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="500 320"
          style={{ animation: 'spinnerCircleRace 1.2s linear infinite', animationDelay: '0.6s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 3. Cyan Pulse - Cyan with pulsing trail
 */
export const SpinnerCyan: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#06b6d420" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#06b6d420" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#06b6d420" strokeWidth="50" fill="none" />

        {/* Racing trail with pulse */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#22d3ee"
          strokeWidth="50"
          fill="none"
          strokeDasharray="3500 6000"
          style={{ animation: 'spinnerRace 2s linear infinite, spinnerFade 1s ease-in-out infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#22d3ee"
          strokeWidth="50"
          fill="none"
          strokeDasharray="450 370"
          style={{ animation: 'spinnerCircleRace 1s linear infinite, spinnerFade 0.5s ease-in-out infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#22d3ee"
          strokeWidth="50"
          fill="none"
          strokeDasharray="450 370"
          style={{ animation: 'spinnerCircleRace 1s linear infinite, spinnerFade 0.5s ease-in-out infinite', animationDelay: '0.5s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 4. Dual Racer - Two trails chasing each other
 */
export const SpinnerDual: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#3b82f615" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#3b82f615" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#3b82f615" strokeWidth="50" fill="none" />

        {/* First trail - Blue */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="2800 6700"
          style={{ animation: 'spinnerRace 3s linear infinite' }}
        />
        {/* Second trail - Cyan (offset) */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="2800 6700"
          style={{ animation: 'spinnerRace 3s linear infinite', animationDelay: '-1.5s' }}
        />

        <circle
          cx="1558" cy="1065" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="400 420"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="400 420"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite', animationDelay: '-0.75s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 5. Reverse Flow - Trail moves backwards
 */
export const SpinnerReverse: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#6366f120" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#6366f120" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#6366f120" strokeWidth="50" fill="none" />

        {/* Reverse racing trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#8b5cf6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="4000 5500"
          style={{ animation: 'spinnerRaceReverse 2.8s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#8b5cf6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRaceReverse 1.4s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#8b5cf6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRaceReverse 1.4s linear infinite', animationDelay: '0.7s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 6. Snake - Long growing/shrinking trail
 */
export const SpinnerSnake: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#10b98115" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#10b98115" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#10b98115" strokeWidth="50" fill="none" />

        {/* Growing/shrinking snake */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          style={{ animation: 'spinnerRace 4s linear infinite, spinnerDashGrow 2s ease-in-out infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="600 220"
          style={{ animation: 'spinnerCircleRace 2s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="600 220"
          style={{ animation: 'spinnerCircleRace 2s linear infinite', animationDelay: '1s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 7. Color Shift Blue - Racing with color transition
 */
export const SpinnerColorShift: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#3b82f615" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#3b82f615" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#3b82f615" strokeWidth="50" fill="none" />

        {/* Color shifting trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="4000 5500"
          style={{ animation: 'spinnerRace 3s linear infinite, spinnerColorBlue 4s ease-in-out infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite, spinnerColorBlue 4s ease-in-out infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite, spinnerColorBlue 4s ease-in-out infinite', animationDelay: '0.75s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 8. Spectrum - Full color spectrum cycling
 */
export const SpinnerSpectrum: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#ffffff10" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#ffffff10" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#ffffff10" strokeWidth="50" fill="none" />

        {/* Spectrum trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="5000 4500"
          style={{ animation: 'spinnerRace 3.5s linear infinite, spinnerColorSpectrum 6s ease-in-out infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="650 170"
          style={{ animation: 'spinnerCircleRace 1.75s linear infinite, spinnerColorSpectrum 6s ease-in-out infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="650 170"
          style={{ animation: 'spinnerCircleRace 1.75s linear infinite, spinnerColorSpectrum 6s ease-in-out infinite', animationDelay: '0.875s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 9. Fast Dash - Quick short dashes
 */
export const SpinnerFast: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#06b6d418" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#06b6d418" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#06b6d418" strokeWidth="50" fill="none" />

        {/* Fast short dash */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="2000 7500"
          style={{ animation: 'spinnerRace 1.5s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="350 470"
          style={{ animation: 'spinnerCircleRace 0.75s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="350 470"
          style={{ animation: 'spinnerCircleRace 0.75s linear infinite', animationDelay: '0.375s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 10. Thick Pulse - Thick stroke with width pulse
 */
export const SpinnerThick: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#3b82f612" strokeWidth="70" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#3b82f612" strokeWidth="70" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#3b82f612" strokeWidth="70" fill="none" />

        {/* Thick pulsing trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#3b82f6"
          strokeWidth="45"
          fill="none"
          strokeDasharray="5500 4000"
          style={{ animation: 'spinnerRace 4s linear infinite, spinnerPulseWidth 2s ease-in-out infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#3b82f6"
          strokeWidth="45"
          fill="none"
          strokeDasharray="700 120"
          style={{ animation: 'spinnerCircleRace 2s linear infinite, spinnerPulseWidth 1s ease-in-out infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#3b82f6"
          strokeWidth="45"
          fill="none"
          strokeDasharray="700 120"
          style={{ animation: 'spinnerCircleRace 2s linear infinite, spinnerPulseWidth 1s ease-in-out infinite', animationDelay: '1s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 11. Triple Chase - Three trails in pursuit
 */
export const SpinnerTriple: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#ffffff08" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#ffffff08" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#ffffff08" strokeWidth="50" fill="none" />

        {/* Three trails */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="2200 7300"
          style={{ animation: 'spinnerRace 3s linear infinite' }}
        />
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="2200 7300"
          style={{ animation: 'spinnerRace 3s linear infinite', animationDelay: '-1s' }}
        />
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="2200 7300"
          style={{ animation: 'spinnerRace 3s linear infinite', animationDelay: '-2s' }}
        />

        <circle
          cx="1558" cy="1065" r="130"
          stroke="#3b82f6"
          strokeWidth="50"
          fill="none"
          strokeDasharray="450 370"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="450 370"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite', animationDelay: '-0.5s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 12. Emerald Cyan Blend - Site theme colors
 */
export const SpinnerEmeraldCyan: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#10b98115" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#10b98115" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#10b98115" strokeWidth="50" fill="none" />

        {/* Color shifting emerald to cyan */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="4200 5300"
          style={{ animation: 'spinnerRace 3s linear infinite, spinnerColorEmeraldCyan 3s ease-in-out infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#10b981"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite, spinnerColorEmeraldCyan 1.5s ease-in-out infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="550 270"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite, spinnerColorEmeraldCyan 1.5s ease-in-out infinite', animationDelay: '0.75s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 13. Gradient Stroke - SVG gradient along stroke
 */
export const SpinnerGradientStroke: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        <defs>
          <linearGradient id={`grad-stroke-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#ffffff10" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#ffffff10" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#ffffff10" strokeWidth="50" fill="none" />

        {/* Gradient stroke trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke={`url(#grad-stroke-${id})`}
          strokeWidth="50"
          fill="none"
          strokeDasharray="4500 5000"
          style={{ animation: 'spinnerRace 3s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke={`url(#grad-stroke-${id})`}
          strokeWidth="50"
          fill="none"
          strokeDasharray="600 220"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke={`url(#grad-stroke-${id})`}
          strokeWidth="50"
          fill="none"
          strokeDasharray="600 220"
          style={{ animation: 'spinnerCircleRace 1.5s linear infinite', animationDelay: '0.75s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 14. Indigo Deep - Rich indigo/purple tones
 */
export const SpinnerIndigo: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#6366f118" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#6366f118" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#6366f118" strokeWidth="50" fill="none" />

        {/* Indigo trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#6366f1"
          strokeWidth="50"
          fill="none"
          strokeDasharray="3800 5700"
          style={{ animation: 'spinnerRace 2.8s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#a78bfa"
          strokeWidth="50"
          fill="none"
          strokeDasharray="520 300"
          style={{ animation: 'spinnerCircleRace 1.4s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#818cf8"
          strokeWidth="50"
          fill="none"
          strokeDasharray="520 300"
          style={{ animation: 'spinnerCircleRace 1.4s linear infinite', animationDelay: '0.7s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 15. Dotted Trail - Segmented dot pattern
 */
export const SpinnerDotted: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#3b82f612" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#3b82f612" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#3b82f612" strokeWidth="50" fill="none" />

        {/* Dotted pattern trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#3b82f6"
          strokeWidth="55"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="120 180"
          style={{ animation: 'spinnerRace 4s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#3b82f6"
          strokeWidth="55"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="80 80"
          style={{ animation: 'spinnerCircleRace 2s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#3b82f6"
          strokeWidth="55"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="80 80"
          style={{ animation: 'spinnerCircleRace 2s linear infinite', animationDelay: '1s' }}
        />
      </svg>
    </div>
  );
};

/**
 * 16. Slow Flow - Calm, slow animation
 */
export const SpinnerSlow: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  const height = size * (1202 / 2256);

  return (
    <div className={className} style={{ width: size, height }}>
      <svg viewBox={MATRIX_LOGO.viewBox} width={size} height={height} fill="none">
        {/* Background track */}
        <path d={MATRIX_LOGO.mainPath} stroke="#06b6d415" strokeWidth="50" fill="none" />
        <circle cx="1558" cy="1065" r="130" stroke="#06b6d415" strokeWidth="50" fill="none" />
        <circle cx="2020" cy="380" r="130" stroke="#06b6d415" strokeWidth="50" fill="none" />

        {/* Slow flowing trail */}
        <path
          d={MATRIX_LOGO.mainPath}
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="6000 3500"
          style={{ animation: 'spinnerRace 8s linear infinite' }}
        />
        <circle
          cx="1558" cy="1065" r="130"
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="700 120"
          style={{ animation: 'spinnerCircleRace 4s linear infinite' }}
        />
        <circle
          cx="2020" cy="380" r="130"
          stroke="#06b6d4"
          strokeWidth="50"
          fill="none"
          strokeDasharray="700 120"
          style={{ animation: 'spinnerCircleRace 4s linear infinite', animationDelay: '2s' }}
        />
      </svg>
    </div>
  );
};

/**
 * RandomMatrixSpinner - Randomly selects one of the 16 spinner variants
 * Each mount will randomly pick a spinner style for variety
 */
export const RandomMatrixSpinner: React.FC<SpinnerProps> = ({ size = 80, className = '' }) => {
  // Pick a random spinner on mount and memoize it
  const SpinnerComponent = React.useMemo(() => {
    const spinners = [
      SpinnerClassic,
      SpinnerOcean,
      SpinnerCyan,
      SpinnerDual,
      SpinnerReverse,
      SpinnerSnake,
      SpinnerColorShift,
      SpinnerSpectrum,
      SpinnerFast,
      SpinnerThick,
      SpinnerTriple,
      SpinnerEmeraldCyan,
      SpinnerGradientStroke,
      SpinnerIndigo,
      SpinnerDotted,
      SpinnerSlow
    ];
    return spinners[Math.floor(Math.random() * spinners.length)];
  }, []);

  return <SpinnerComponent size={size} className={className} />;
};

/**
 * All spinner variants exported as array for external use
 */
export const ALL_SPINNERS = [
  SpinnerClassic,
  SpinnerOcean,
  SpinnerCyan,
  SpinnerDual,
  SpinnerReverse,
  SpinnerSnake,
  SpinnerColorShift,
  SpinnerSpectrum,
  SpinnerFast,
  SpinnerThick,
  SpinnerTriple,
  SpinnerEmeraldCyan,
  SpinnerGradientStroke,
  SpinnerIndigo,
  SpinnerDotted,
  SpinnerSlow
];

export { MATRIX_LOGO };
