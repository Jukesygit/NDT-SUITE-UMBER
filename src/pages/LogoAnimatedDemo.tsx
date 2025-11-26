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

interface VariantInfo {
  name: string;
  description: string;
  useCase: string;
  component: React.FC<{ size?: number }>;
}

const variants: VariantInfo[] = [
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

const LogoAnimatedDemo: React.FC = () => {
  const [selectedSize, setSelectedSize] = useState(280);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-12">
        <h1 className="text-3xl font-bold text-white mb-2">Gradient Logo Variants</h1>
        <p className="text-gray-400 text-lg">8 animated gradient styles for the Matrix logo</p>
      </div>

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
        <h2 className="text-xl font-bold text-white mb-6">Animation Variants</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {variants.map(({ name, description, useCase, component: Component }, index) => (
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
    </div>
  );
};

export default LogoAnimatedDemo;
