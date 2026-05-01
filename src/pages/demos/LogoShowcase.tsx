import React from 'react';
import {
  LogoGradientShift,
  LogoGradientWave,
  LogoGradientPulse,
  LogoGradientSweep,
  LogoGradientBreathe,
  LogoGradientSplit,
  LogoGradientShimmer,
  LogoGradientAurora,
  LogoGlitchRain,
  LogoGlitchRGB,
  LogoGlitchScanline,
  LogoGlitchNeon,
  LogoGlitchCorrupt,
  LogoGlitchStrobe,
  LogoGlitchNoise,
  LogoGlitchFragment,
  LogoGlitchMelt,
  LogoGlitchHex,
  LogoStatic,
} from '../../components/MatrixLogoAnimated';
import {
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
  SpinnerSlow,
} from '../../components/MatrixSpinners';

interface CardProps {
  label: string;
  dark?: boolean;
  children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ label, dark, children }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      padding: 24,
      borderRadius: 12,
      background: dark ? '#050505' : 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      minWidth: 220,
    }}
  >
    {children}
    <span style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{label}</span>
  </div>
);

const LogoShowcase: React.FC = () => {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#e5e5e5',
        padding: '40px 24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Matrix Portal Logo & Spinner Showcase
      </h1>
      <p style={{ color: '#888', marginBottom: 40, fontSize: 14 }}>
        All animated logo variants and spinner styles in one place.
      </p>

      {/* Glitch Variants */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#00ff41' }}>
          Glitch Variants (10)
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Card label="1. Matrix Rain" dark>
            <LogoGlitchRain size={240} />
          </Card>
          <Card label="2. RGB Split" dark>
            <LogoGlitchRGB size={240} />
          </Card>
          <Card label="3. Scanline Flicker" dark>
            <LogoGlitchScanline size={240} />
          </Card>
          <Card label="4. Neon Pulse" dark>
            <LogoGlitchNeon size={240} />
          </Card>
          <Card label="5. Data Corrupt" dark>
            <LogoGlitchCorrupt size={240} />
          </Card>
          <Card label="6. Strobe" dark>
            <LogoGlitchStrobe size={240} />
          </Card>
          <Card label="7. Static Noise" dark>
            <LogoGlitchNoise size={240} />
          </Card>
          <Card label="8. Fragment" dark>
            <LogoGlitchFragment size={240} />
          </Card>
          <Card label="9. Meltdown" dark>
            <LogoGlitchMelt size={240} />
          </Card>
          <Card label="10. Hex Cascade" dark>
            <LogoGlitchHex size={240} />
          </Card>
        </div>
      </section>

      {/* Animated Logo Variants */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          Gradient Logo Variants (8)
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Card label="Gradient Shift (nav)">
            <LogoGradientShift size={160} />
          </Card>
          <Card label="Gradient Wave">
            <LogoGradientWave size={160} />
          </Card>
          <Card label="Gradient Pulse">
            <LogoGradientPulse size={160} />
          </Card>
          <Card label="Gradient Sweep">
            <LogoGradientSweep size={160} />
          </Card>
          <Card label="Gradient Breathe">
            <LogoGradientBreathe size={160} />
          </Card>
          <Card label="Gradient Split">
            <LogoGradientSplit size={160} />
          </Card>
          <Card label="Gradient Shimmer">
            <LogoGradientShimmer size={160} />
          </Card>
          <Card label="Gradient Aurora">
            <LogoGradientAurora size={160} />
          </Card>
          <Card label="Static">
            <LogoStatic size={160} />
          </Card>
        </div>
      </section>

      {/* Spinners */}
      <section style={{ marginBottom: 56 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          Spinner Variants (16)
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { C: SpinnerClassic, name: '1. Classic' },
            { C: SpinnerOcean, name: '2. Ocean Blue' },
            { C: SpinnerCyan, name: '3. Cyan Pulse' },
            { C: SpinnerDual, name: '4. Dual Racer' },
            { C: SpinnerReverse, name: '5. Reverse' },
            { C: SpinnerSnake, name: '6. Snake' },
            { C: SpinnerColorShift, name: '7. Color Shift' },
            { C: SpinnerSpectrum, name: '8. Spectrum' },
            { C: SpinnerFast, name: '9. Fast Dash' },
            { C: SpinnerThick, name: '10. Thick Pulse' },
            { C: SpinnerTriple, name: '11. Triple Chase' },
            { C: SpinnerEmeraldCyan, name: '12. Emerald Cyan' },
            { C: SpinnerGradientStroke, name: '13. Gradient Stroke' },
            { C: SpinnerIndigo, name: '14. Indigo' },
            { C: SpinnerDotted, name: '15. Dotted' },
            { C: SpinnerSlow, name: '16. Slow Flow' },
          ].map(({ C, name }) => (
            <Card key={name} label={name}>
              <C size={120} />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LogoShowcase;
