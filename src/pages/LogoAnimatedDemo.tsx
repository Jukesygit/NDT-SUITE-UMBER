import React, { useState } from 'react';
import {
  LogoGradientShift,
  LogoGradientWave,
  LogoGradientPulse,
  LogoGradientSweep,
  LogoGradientBreathe,
  LogoGradientSplit,
  LogoGradientShimmer,
  LogoGradientAurora,
  LogoStatic
} from '../components/MatrixLogoAnimated';
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
  SpinnerSlow
} from '../components/MatrixSpinners';

interface VariantInfo {
  name: string;
  description: string;
  useCase: string;
  component: React.FC<{ size?: number }>;
}

interface SpinnerInfo {
  name: string;
  description: string;
  speed: 'slow' | 'medium' | 'fast';
  colors: string[];
  component: React.FC<{ size?: number }>;
}

const gradientVariants: VariantInfo[] = [
  {
    name: 'Gradient Shift',
    description: 'Diagonal gradient with smooth 3-color cycling',
    useCase: 'Headers, brand identity, hero sections',
    component: LogoGradientShift
  },
  {
    name: 'Gradient Wave',
    description: 'Horizontal gradient flowing across',
    useCase: 'Loading states, progress indication',
    component: LogoGradientWave
  },
  {
    name: 'Gradient Pulse',
    description: 'Radial gradient pulsing from center',
    useCase: 'Focus states, notifications, alerts',
    component: LogoGradientPulse
  },
  {
    name: 'Gradient Sweep',
    description: 'Rainbow gradient rotating around',
    useCase: 'Celebrations, achievements, special events',
    component: LogoGradientSweep
  },
  {
    name: 'Gradient Breathe',
    description: 'Subtle brightness pulse with glow',
    useCase: 'Ambient presence, idle states, footers',
    component: LogoGradientBreathe
  },
  {
    name: 'Gradient Split',
    description: 'Two-tone split shifting position',
    useCase: 'Interactive elements, toggle states',
    component: LogoGradientSplit
  },
  {
    name: 'Gradient Shimmer',
    description: 'Fast highlight sweep across base',
    useCase: 'Premium feel, buttons, CTAs',
    component: LogoGradientShimmer
  },
  {
    name: 'Gradient Aurora',
    description: 'Northern lights style flowing colors',
    useCase: 'Splash screens, about pages, backgrounds',
    component: LogoGradientAurora
  }
];

const spinnerVariants: SpinnerInfo[] = [
  {
    name: 'Classic Racer',
    description: 'Original sync button style trail',
    speed: 'medium',
    colors: ['emerald'],
    component: SpinnerClassic
  },
  {
    name: 'Ocean Blue',
    description: 'Clean blue racing trail',
    speed: 'medium',
    colors: ['blue'],
    component: SpinnerOcean
  },
  {
    name: 'Cyan Pulse',
    description: 'Cyan trail with fade pulse',
    speed: 'fast',
    colors: ['cyan'],
    component: SpinnerCyan
  },
  {
    name: 'Dual Racer',
    description: 'Two trails chasing each other',
    speed: 'medium',
    colors: ['blue', 'cyan'],
    component: SpinnerDual
  },
  {
    name: 'Reverse Flow',
    description: 'Trail moves in reverse direction',
    speed: 'medium',
    colors: ['violet'],
    component: SpinnerReverse
  },
  {
    name: 'Snake',
    description: 'Growing and shrinking trail',
    speed: 'slow',
    colors: ['emerald'],
    component: SpinnerSnake
  },
  {
    name: 'Color Shift',
    description: 'Blue tones cycling as it races',
    speed: 'medium',
    colors: ['blue', 'cyan', 'indigo'],
    component: SpinnerColorShift
  },
  {
    name: 'Spectrum',
    description: 'Full color spectrum transition',
    speed: 'medium',
    colors: ['blue', 'violet', 'cyan', 'emerald'],
    component: SpinnerSpectrum
  },
  {
    name: 'Fast Dash',
    description: 'Quick short racing segment',
    speed: 'fast',
    colors: ['cyan'],
    component: SpinnerFast
  },
  {
    name: 'Thick Pulse',
    description: 'Pulsing stroke width effect',
    speed: 'slow',
    colors: ['blue'],
    component: SpinnerThick
  },
  {
    name: 'Triple Chase',
    description: 'Three colored trails in pursuit',
    speed: 'medium',
    colors: ['blue', 'cyan', 'emerald'],
    component: SpinnerTriple
  },
  {
    name: 'Emerald Cyan',
    description: 'Site theme color blend',
    speed: 'medium',
    colors: ['emerald', 'cyan'],
    component: SpinnerEmeraldCyan
  },
  {
    name: 'Gradient Stroke',
    description: 'SVG gradient applied to stroke',
    speed: 'medium',
    colors: ['blue', 'cyan', 'emerald'],
    component: SpinnerGradientStroke
  },
  {
    name: 'Indigo Deep',
    description: 'Rich indigo/purple palette',
    speed: 'medium',
    colors: ['indigo', 'violet'],
    component: SpinnerIndigo
  },
  {
    name: 'Dotted Trail',
    description: 'Segmented dot pattern',
    speed: 'slow',
    colors: ['blue'],
    component: SpinnerDotted
  },
  {
    name: 'Slow Flow',
    description: 'Calm, meditative animation',
    speed: 'slow',
    colors: ['cyan'],
    component: SpinnerSlow
  }
];

const colorBadge = (color: string) => {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    cyan: 'bg-cyan-500',
    indigo: 'bg-indigo-500',
    violet: 'bg-violet-500',
  };
  return colorMap[color] || 'bg-gray-500';
};

const speedBadge = (speed: 'slow' | 'medium' | 'fast') => {
  const speedMap = {
    slow: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Slow' },
    medium: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Medium' },
    fast: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Fast' },
  };
  return speedMap[speed];
};

const LogoAnimatedDemo: React.FC = () => {
  const [selectedSize, setSelectedSize] = useState(200);
  const [spinnerSize, setSpinnerSize] = useState(120);
  const [activeTab, setActiveTab] = useState<'spinners' | 'gradients'>('spinners');

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Matrix Logo Animations</h1>
        <p className="text-gray-400 text-lg">Spinner and gradient animation variants for the Matrix M logo</p>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex gap-2 bg-[#111] p-1 rounded-lg inline-flex border border-gray-800">
          <button
            onClick={() => setActiveTab('spinners')}
            className={`px-6 py-2.5 rounded-md font-medium transition-all ${
              activeTab === 'spinners'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            Spinners ({spinnerVariants.length})
          </button>
          <button
            onClick={() => setActiveTab('gradients')}
            className={`px-6 py-2.5 rounded-md font-medium transition-all ${
              activeTab === 'gradients'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            Gradients ({gradientVariants.length})
          </button>
        </div>
      </div>

      {/* SPINNERS TAB */}
      {activeTab === 'spinners' && (
        <>
          {/* Size Control */}
          <div className="max-w-7xl mx-auto mb-8 bg-[#111] rounded-xl p-6 border border-gray-800">
            <div className="flex items-center gap-8">
              <div>
                <label className="block text-sm text-gray-400 mb-3">Spinner Size: {spinnerSize}px</label>
                <input
                  type="range"
                  min="40"
                  max="300"
                  value={spinnerSize}
                  onChange={(e) => setSpinnerSize(Number(e.target.value))}
                  className="w-64 accent-blue-500"
                />
              </div>
              <div className="flex gap-3">
                {[40, 80, 120, 200].map((size) => (
                  <button
                    key={size}
                    onClick={() => setSpinnerSize(size)}
                    className={`px-3 py-1.5 text-sm rounded border transition-all ${
                      spinnerSize === size
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : 'border-gray-700 text-gray-500 hover:border-gray-600'
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Spinner Grid */}
          <div className="max-w-7xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-6">Racer Spinners</h2>
            <p className="text-sm text-gray-500 mb-6">
              Stroke-based racing animations - no glow effects, clean trails. Based on the sync button spinner.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {spinnerVariants.map(({ name, description, speed, colors, component: Component }, index) => {
                const speedInfo = speedBadge(speed);
                return (
                  <div key={name} className="bg-[#111] rounded-xl border border-gray-800 overflow-hidden group hover:border-gray-700 transition-all">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-800/50">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-white">
                          {index + 1}. {name}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${speedInfo.bg} ${speedInfo.text}`}>
                          {speedInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{description}</p>
                    </div>

                    {/* Spinner Display */}
                    <div
                      className="flex justify-center items-center py-8 px-4 bg-[#080808]"
                      style={{ minHeight: Math.max(spinnerSize + 40, 120) }}
                    >
                      <Component size={spinnerSize} />
                    </div>

                    {/* Color badges */}
                    <div className="px-4 py-2 bg-[#0d0d0d] border-t border-gray-800/50 flex gap-1.5">
                      {colors.map((color) => (
                        <span
                          key={color}
                          className={`w-3 h-3 rounded-full ${colorBadge(color)}`}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Size Comparison */}
          <div className="max-w-7xl mx-auto mt-12">
            <h2 className="text-xl font-bold text-white mb-6">Size Comparison</h2>
            <div className="bg-[#111] rounded-xl border border-gray-800 p-8">
              <div className="flex items-end justify-center gap-8 flex-wrap">
                {[24, 40, 60, 80, 120, 180].map((size) => (
                  <div key={size} className="flex flex-col items-center gap-2">
                    <SpinnerOcean size={size} />
                    <span className="text-xs text-gray-500">{size}px</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Usage Examples */}
          <div className="max-w-7xl mx-auto mt-12">
            <h2 className="text-xl font-bold text-white mb-6">Usage Examples</h2>

            {/* Button loading states */}
            <div className="bg-[#111] rounded-xl border border-gray-800 p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">Button Loading States</h3>
              <div className="flex flex-wrap gap-4">
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                  <SpinnerOcean size={20} />
                  <span>Loading...</span>
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                  <SpinnerClassic size={20} />
                  <span>Saving...</span>
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors">
                  <SpinnerFast size={20} />
                  <span>Syncing...</span>
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors">
                  <SpinnerReverse size={20} />
                  <span>Processing...</span>
                </button>
              </div>
            </div>

            {/* Inline spinners */}
            <div className="bg-[#111] rounded-xl border border-gray-800 p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">Inline Status</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-gray-300">
                  <SpinnerDual size={24} />
                  <span>Uploading files to server...</span>
                </div>
                <div className="flex items-center gap-3 text-gray-300">
                  <SpinnerTriple size={24} />
                  <span>Processing multiple tasks...</span>
                </div>
                <div className="flex items-center gap-3 text-gray-300">
                  <SpinnerSlow size={24} />
                  <span>Background sync in progress</span>
                </div>
              </div>
            </div>

            {/* Card loading */}
            <div className="bg-[#111] rounded-xl border border-gray-800 p-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">Card Loading Overlay</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative bg-[#0a0a0a] rounded-lg p-6 border border-gray-800 min-h-[120px] flex items-center justify-center">
                  <SpinnerEmeraldCyan size={60} />
                </div>
                <div className="relative bg-[#0a0a0a] rounded-lg p-6 border border-gray-800 min-h-[120px] flex items-center justify-center">
                  <SpinnerGradientStroke size={60} />
                </div>
                <div className="relative bg-[#0a0a0a] rounded-lg p-6 border border-gray-800 min-h-[120px] flex items-center justify-center">
                  <SpinnerSpectrum size={60} />
                </div>
              </div>
            </div>
          </div>

          {/* Implementation */}
          <div className="max-w-7xl mx-auto mt-12 mb-8">
            <div className="bg-[#111] rounded-xl p-6 border border-gray-800">
              <h2 className="text-lg font-semibold text-white mb-4">Implementation</h2>
              <div className="text-sm text-gray-400 space-y-2">
                <p>
                  <code className="text-blue-400">
                    import {'{ SpinnerOcean, SpinnerDual, SpinnerColorShift }'} from '../components/MatrixSpinners';
                  </code>
                </p>
                <p className="mt-4">Each spinner accepts:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li><code className="text-gray-300">size</code> - Width in pixels (default: 80)</li>
                  <li><code className="text-gray-300">className</code> - Additional CSS classes</li>
                </ul>
                <div className="mt-4 p-4 bg-[#0a0a0a] rounded-lg">
                  <code className="text-gray-300">
                    {'<SpinnerOcean size={40} />'}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* GRADIENTS TAB */}
      {activeTab === 'gradients' && (
        <>
          {/* Size Control */}
          <div className="max-w-7xl mx-auto mb-10 bg-[#111] rounded-xl p-6 border border-gray-800">
            <div className="flex items-center gap-8">
              <div>
                <label className="block text-sm text-gray-400 mb-3">Size: {selectedSize}px</label>
                <input
                  type="range"
                  min="120"
                  max="400"
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(Number(e.target.value))}
                  className="w-64 accent-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Static Reference */}
          <div className="max-w-7xl mx-auto mb-10">
            <div className="bg-[#111] rounded-xl p-8 border border-gray-800">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Static Reference</h2>
                  <p className="text-sm text-gray-500 mt-1">Base gradient without animation</p>
                </div>
                <code className="text-xs text-gray-600 bg-gray-900 px-3 py-1 rounded">{'<LogoStatic />'}</code>
              </div>
              <div className="flex justify-center py-8 bg-[#0a0a0a] rounded-lg">
                <LogoStatic size={selectedSize} />
              </div>
            </div>
          </div>

          {/* Variants Grid */}
          <div className="max-w-7xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-6">Gradient Animation Variants</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {gradientVariants.map(({ name, description, useCase, component: Component }, index) => (
                <div key={name} className="bg-[#111] rounded-xl border border-gray-800 overflow-hidden">
                  {/* Variant header */}
                  <div className="px-6 py-4 border-b border-gray-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {index + 1}. {name}
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">{description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Logo display */}
                  <div className="flex justify-center items-center py-10 px-6 bg-[#0a0a0a]" style={{ minHeight: 200 }}>
                    <Component size={selectedSize} />
                  </div>

                  {/* Use case */}
                  <div className="px-6 py-3 bg-[#0d0d0d] border-t border-gray-800">
                    <span className="text-xs text-gray-500">Best for: </span>
                    <span className="text-xs text-emerald-400">{useCase}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Header Preview Section */}
          <div className="max-w-7xl mx-auto mt-12">
            <h2 className="text-xl font-bold text-white mb-6">Header Preview</h2>
            <p className="text-sm text-gray-500 mb-4">See how each variant looks in a typical header context</p>

            <div className="space-y-4">
              {[
                { name: 'Static', Comp: LogoStatic },
                { name: 'Shift', Comp: LogoGradientShift },
                { name: 'Shimmer', Comp: LogoGradientShimmer },
                { name: 'Breathe', Comp: LogoGradientBreathe },
                { name: 'Aurora', Comp: LogoGradientAurora },
              ].map(({ name, Comp }) => (
                <div key={name} className="bg-[#111] rounded-xl border border-gray-800 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Comp size={48} />
                      <span className="text-white font-semibold">NDT Suite</span>
                      <span className="text-xs text-gray-600 ml-2">({name})</span>
                    </div>
                    <nav className="flex gap-6 text-sm text-gray-400">
                      <span>Dashboard</span>
                      <span>Personnel</span>
                      <span>Tools</span>
                    </nav>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Implementation Notes */}
          <div className="max-w-7xl mx-auto mt-12 mb-8">
            <div className="bg-[#111] rounded-xl p-6 border border-gray-800">
              <h2 className="text-lg font-semibold text-white mb-4">Implementation</h2>
              <div className="text-sm text-gray-400 space-y-2">
                <p><code className="text-emerald-400">import {'{ LogoGradientShift, LogoGradientShimmer, ... }'} from '../components/MatrixLogoAnimated';</code></p>
                <p className="mt-4">Each variant accepts:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li><code className="text-gray-300">size</code> - Width in pixels (height auto-calculated for aspect ratio)</li>
                  <li><code className="text-gray-300">className</code> - Additional CSS classes</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LogoAnimatedDemo;
