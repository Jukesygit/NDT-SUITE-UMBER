import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as Plotly from 'plotly.js-dist-min';
import { CscanData, Tool, DisplaySettings } from './types';

interface CanvasViewportProps {
  data: CscanData;
  activeTool: Tool;
  displaySettings: DisplaySettings;
}

export interface CanvasViewportHandle {
  exportImage: () => Promise<string | null>;
}

/**
 * CanvasViewport - Simple heatmap display component
 * Only renders the C-Scan heatmap, no profile charts
 */
const CanvasViewport = forwardRef<CanvasViewportHandle, CanvasViewportProps>(({
  data,
  activeTool,
  displaySettings
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  // Expose exportImage method via ref
  useImperativeHandle(ref, () => ({
    exportImage: async () => {
      if (!plotRef.current) return null;
      try {
        const dataUrl = await Plotly.toImage(plotRef.current, {
          format: 'png',
          width: 1920,
          height: 1080,
          scale: 2
        });
        return dataUrl;
      } catch (error) {
        console.error('Error exporting image:', error);
        return null;
      }
    }
  }), []);

  // Render the heatmap
  const renderPlot = useCallback(async () => {
    if (!plotRef.current || !data) return;

    const zData = data.data;
    const { min, max } = displaySettings.range;

    // Use custom range if set, otherwise use data stats
    const zMin = min ?? data.stats?.min ?? 0;
    const zMax = max ?? data.stats?.max ?? 1;

    const trace: Partial<Plotly.Data> = {
      type: 'heatmap',
      z: zData,
      x: data.xAxis,
      y: data.yAxis,
      colorscale: displaySettings.colorScale,
      reversescale: displaySettings.reverseScale,
      zmin: zMin,
      zmax: zMax,
      connectgaps: false,
      hovertemplate: 'Scan Axis: %{x:.2f} mm<br>Index Axis: %{y:.2f} mm<br>Thickness: %{z:.2f} mm<extra></extra>',
      colorbar: {
        title: { text: 'Thickness<br>(mm)', side: 'right' },
        thickness: 15,
        len: 0.9,
        x: 1.02
      },
      zsmooth: displaySettings.smoothing === 'none' ? false : displaySettings.smoothing
    } as any;

    const layout: Partial<Plotly.Layout> = {
      autosize: true,
      margin: { l: 60, r: 80, t: 30, b: 50 },
      title: {
        text: data.filename || 'C-Scan Heatmap',
        font: { size: 14, color: '#ffffff' },
        y: 0.98
      },
      xaxis: {
        title: { text: 'Scan Axis (mm)', font: { size: 12 } },
        scaleanchor: 'y',
        scaleratio: 1.0,
        showgrid: displaySettings.showGrid,
        gridcolor: '#4b5563',
        zeroline: false
      },
      yaxis: {
        title: { text: 'Index Axis (mm)', font: { size: 12 } },
        showgrid: displaySettings.showGrid,
        gridcolor: '#4b5563',
        zeroline: false
      },
      paper_bgcolor: 'rgb(31, 41, 55)',
      plot_bgcolor: 'rgb(31, 41, 55)',
      font: { color: '#ffffff' },
      dragmode: activeTool === 'pan' ? 'pan' : 'zoom',
      hovermode: 'closest'
    };

    const config: Partial<Plotly.Config> = {
      responsive: true,
      displaylogo: false,
      displayModeBar: true,
      modeBarButtonsToRemove: ['select2d', 'lasso2d'],
      scrollZoom: true
    };

    await Plotly.react(plotRef.current, [trace], layout, config);

    // Force resize after render
    setTimeout(() => {
      if (plotRef.current) {
        Plotly.Plots.resize(plotRef.current);
      }
    }, 100);
  }, [data, displaySettings, activeTool]);

  // Initialize and update plot
  useEffect(() => {
    renderPlot();

    return () => {
      if (plotRef.current) {
        Plotly.purge(plotRef.current);
      }
    };
  }, [renderPlot]);

  // Handle container resize (not just window resize)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize - wait for CSS transition to complete (300ms)
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (plotRef.current) {
          Plotly.Plots.resize(plotRef.current);
        }
      }, 350);
    });

    // Observe the container, not the plot (Plotly sets fixed dimensions on plot)
    resizeObserver.observe(container);

    return () => {
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      <div
        ref={plotRef}
        className="w-full h-full"
      />
    </div>
  );
});

export default CanvasViewport;