import React from 'react';
import {
  MatrixLogoLoader,
  MatrixLogoLoaderFull,
  MatrixLogoRacer
} from '../components/MatrixLogoLoader';

/**
 * Demo page to preview all Matrix logo animation variants
 * Access at /logo-demo (add route temporarily to test)
 */
const LogoDemo: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Matrix Logo Animation Variants</h1>

      {/* Main Racer - Actual Logo */}
      <div className="bg-[#111] rounded-xl p-8 mb-8 border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-2">Actual Matrix Logo - Racing Light</h2>
        <p className="text-sm text-gray-500 mb-6">Traced from your actual SVG logo with racing light effect</p>
        <div className="flex justify-center py-8">
          <MatrixLogoRacer size={400} duration={4} />
        </div>
      </div>

      {/* Size variations of actual logo */}
      <h2 className="text-xl font-bold text-white mt-12 mb-6">Size Variations (Actual Logo)</h2>
      <div className="flex items-center gap-8 flex-wrap justify-center bg-[#111] rounded-xl p-8 border border-gray-800">
        {[150, 250, 350].map(size => (
          <div key={size} className="flex flex-col items-center gap-4">
            <MatrixLogoRacer size={size} />
            <span className="text-xs text-gray-600">{size}px</span>
          </div>
        ))}
      </div>

      {/* Color variations */}
      <h2 className="text-xl font-bold text-white mt-12 mb-6">Color Variations</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {[
          { color: '#10b981', name: 'Emerald (Default)' },
          { color: '#3b82f6', name: 'Blue' },
          { color: '#8b5cf6', name: 'Purple' },
          { color: '#f59e0b', name: 'Amber' },
          { color: '#ef4444', name: 'Red' },
          { color: '#ffffff', name: 'White' },
        ].map(({ color, name }) => (
          <div key={color} className="bg-[#111] rounded-xl p-6 flex flex-col items-center gap-4 border border-gray-800">
            <MatrixLogoRacer size={200} color={color} trailColor={`${color}20`} />
            <span className="text-sm text-gray-400">{name}</span>
          </div>
        ))}
      </div>

      {/* Speed variations */}
      <h2 className="text-xl font-bold text-white mt-12 mb-6">Speed Variations</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { duration: 2, name: 'Fast' },
          { duration: 4, name: 'Normal' },
          { duration: 6, name: 'Slow' },
        ].map(({ duration, name }) => (
          <div key={duration} className="bg-[#111] rounded-xl p-6 flex flex-col items-center gap-4 border border-gray-800">
            <MatrixLogoRacer size={200} duration={duration} />
            <span className="text-sm text-gray-400">{name} ({duration}s)</span>
          </div>
        ))}
      </div>

      {/* Simple M variants (fallback/simple version) */}
      <h2 className="text-xl font-bold text-white mt-12 mb-6">Simple M Variants (Fallback)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#111] rounded-xl p-8 flex flex-col items-center gap-4 border border-gray-800">
          <h3 className="text-md font-semibold text-white">Simple</h3>
          <MatrixLogoLoader size={100} />
          <code className="text-xs text-gray-600">{'<MatrixLogoLoader />'}</code>
        </div>
        <div className="bg-[#111] rounded-xl p-8 flex flex-col items-center gap-4 border border-gray-800">
          <h3 className="text-md font-semibold text-white">Full</h3>
          <MatrixLogoLoaderFull size={100} />
          <code className="text-xs text-gray-600">{'<MatrixLogoLoaderFull />'}</code>
        </div>
      </div>
    </div>
  );
};

export default LogoDemo;
