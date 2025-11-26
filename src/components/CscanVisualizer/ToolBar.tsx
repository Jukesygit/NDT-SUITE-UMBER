import React, { useState, useEffect } from 'react';
import { Move, ZoomIn } from 'lucide-react';
import { Tool, DisplaySettings } from './types';

interface ToolBarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  displaySettings: DisplaySettings;
  onDisplaySettingsChange: (settings: DisplaySettings) => void;
  dataMin?: number;
  dataMax?: number;
}

const ToolBar: React.FC<ToolBarProps> = ({
  activeTool,
  onToolChange,
  displaySettings,
  onDisplaySettingsChange,
  dataMin = 0,
  dataMax = 100
}) => {
  // Local state for min/max inputs
  const [minInput, setMinInput] = useState<string>(
    displaySettings.range.min?.toFixed(2) ?? dataMin.toFixed(2)
  );
  const [maxInput, setMaxInput] = useState<string>(
    displaySettings.range.max?.toFixed(2) ?? dataMax.toFixed(2)
  );

  // Update local state when displaySettings or data range changes
  useEffect(() => {
    setMinInput(displaySettings.range.min?.toFixed(2) ?? dataMin.toFixed(2));
    setMaxInput(displaySettings.range.max?.toFixed(2) ?? dataMax.toFixed(2));
  }, [displaySettings.range, dataMin, dataMax]);

  const tools: { id: Tool; icon: React.ReactNode; title: string }[] = [
    { id: 'pan', icon: <Move className="w-4 h-4" />, title: 'Pan' },
    { id: 'zoom', icon: <ZoomIn className="w-4 h-4" />, title: 'Zoom' }
  ];

  const colorScales = [
    'Jet', 'Viridis', 'Hot', 'RdBu', 'YlOrRd', 'Picnic', 'Portland', 'Electric'
  ];

  // Apply the range change
  const handleApplyRange = () => {
    const min = parseFloat(minInput);
    const max = parseFloat(maxInput);

    if (!isNaN(min) && !isNaN(max) && min < max) {
      onDisplaySettingsChange({
        ...displaySettings,
        range: { min, max }
      });
    }
  };

  // Reset to auto range
  const handleAutoRange = () => {
    setMinInput(dataMin.toFixed(2));
    setMaxInput(dataMax.toFixed(2));
    onDisplaySettingsChange({
      ...displaySettings,
      range: { min: null, max: null }
    });
  };

  // Handle Enter key in inputs
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApplyRange();
    }
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        {/* Tool Group */}
        <div className="flex bg-gray-900 rounded">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`
                p-2 transition-colors
                ${activeTool === tool.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'}
              `}
              title={tool.title}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Color Scale */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Color:</label>
          <select
            value={displaySettings.colorScale}
            onChange={(e) => onDisplaySettingsChange({
              ...displaySettings,
              colorScale: e.target.value
            })}
            style={{
              padding: '4px 8px',
              backgroundColor: '#374151',
              color: '#ffffff',
              fontSize: '12px',
              border: '1px solid #4b5563',
              borderRadius: '4px',
              outline: 'none',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
          >
            {colorScales.map(scale => (
              <option key={scale} value={scale}>{scale}</option>
            ))}
          </select>
        </div>

        {/* Smoothing */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Smooth:</label>
          <select
            value={displaySettings.smoothing}
            onChange={(e) => onDisplaySettingsChange({
              ...displaySettings,
              smoothing: e.target.value as 'none' | 'fast' | 'best'
            })}
            style={{
              padding: '4px 8px',
              backgroundColor: '#374151',
              color: '#ffffff',
              fontSize: '12px',
              border: '1px solid #4b5563',
              borderRadius: '4px',
              outline: 'none',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
          >
            <option value="none">None</option>
            <option value="fast">Fast</option>
            <option value="best">Best</option>
          </select>
        </div>

        {/* Toggle Buttons */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={displaySettings.reverseScale}
              onChange={(e) => onDisplaySettingsChange({
                ...displaySettings,
                reverseScale: e.target.checked
              })}
              className="w-3 h-3 rounded"
            />
            <span className="text-xs text-gray-400">Reverse</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={displaySettings.showGrid}
              onChange={(e) => onDisplaySettingsChange({
                ...displaySettings,
                showGrid: e.target.checked
              })}
              className="w-3 h-3 rounded"
            />
            <span className="text-xs text-gray-400">Grid</span>
          </label>
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Min/Max Range Controls - THE KEY FEATURE */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Range:</label>
          <input
            type="text"
            inputMode="decimal"
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Min"
            style={{
              width: '64px',
              padding: '4px 8px',
              backgroundColor: '#374151',
              color: '#ffffff',
              fontSize: '12px',
              border: '1px solid #4b5563',
              borderRadius: '4px',
              outline: 'none',
              cursor: 'text',
              pointerEvents: 'auto'
            }}
            title="Minimum thickness"
          />
          <span className="text-xs text-gray-500">-</span>
          <input
            type="text"
            inputMode="decimal"
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Max"
            style={{
              width: '64px',
              padding: '4px 8px',
              backgroundColor: '#374151',
              color: '#ffffff',
              fontSize: '12px',
              border: '1px solid #4b5563',
              borderRadius: '4px',
              outline: 'none',
              cursor: 'text',
              pointerEvents: 'auto'
            }}
            title="Maximum thickness"
          />
          <button
            onClick={handleApplyRange}
            className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
            title="Apply range"
          >
            Apply
          </button>
          <button
            onClick={handleAutoRange}
            className="px-3 py-1 bg-gray-600 text-white text-xs font-medium rounded hover:bg-gray-700 transition-colors"
            title="Reset to auto range"
          >
            Auto
          </button>
        </div>
      </div>
    </div>
  );
};

export default ToolBar;