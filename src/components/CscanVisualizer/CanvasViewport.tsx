import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import { CscanData, Tool, DisplaySettings } from './types';

interface CanvasViewportProps {
  data: CscanData;
  activeTool: Tool;
  displaySettings: DisplaySettings;
}

export interface CanvasViewportHandle {
  exportImage: () => Promise<string | null>;
  exportCleanHeatmap: () => Promise<string | null>;
}

// Plotly will be dynamically imported
let Plotly: any = null;

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
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);

  // Load Plotly dynamically on component mount
  useEffect(() => {
    let mounted = true;

    const loadPlotly = async () => {
      if (!Plotly) {
        const plotlyModule = await import('plotly.js-dist-min');
        if (mounted) {
          Plotly = plotlyModule.default;
          setPlotlyLoaded(true);
        }
      } else {
        setPlotlyLoaded(true);
      }
    };

    loadPlotly();

    return () => {
      mounted = false;
    };
  }, []);

  // Expose export methods via ref
  useImperativeHandle(ref, () => ({
    exportImage: async () => {
      if (!plotRef.current || !Plotly) return null;
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
    },
    exportCleanHeatmap: async () => {
      if (!data || !Plotly) return null;

      try {
        // Create a temporary div for the clean export
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        document.body.appendChild(tempDiv);

        const zData = data.data;
        const { min, max } = displaySettings.range;
        const zMin = min ?? data.stats?.min ?? 0;
        const zMax = max ?? data.stats?.max ?? 1;

        // Full resolution based on actual data matrix dimensions
        // data.data is [rows][cols], so height = number of rows, width = number of columns
        const numRows = zData.length;
        const numCols = zData[0]?.length ?? 0;

        // Export at 1:1 - each data point = 1 pixel
        const exportWidth = numCols;
        const exportHeight = numRows;

        // Clean heatmap trace - no colorbar, no smoothing for pixel-perfect export
        const cleanTrace: Partial<Plotly.Data> = {
          type: 'heatmap',
          z: zData,
          colorscale: displaySettings.colorScale,
          reversescale: displaySettings.reverseScale,
          zmin: zMin,
          zmax: zMax,
          connectgaps: false,
          showscale: false, // Hide colorbar
          zsmooth: false // Disable smoothing for pixel-perfect 1:1 export
        } as any;

        // Clean layout - no axes, no title, transparent background
        const cleanLayout: Partial<Plotly.Layout> = {
          width: exportWidth,
          height: exportHeight,
          margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          xaxis: {
            visible: false,
            showgrid: false,
            zeroline: false,
            showticklabels: false,
            showline: false,
            range: [-0.5, numCols - 0.5], // Exact range to avoid padding
            constrain: 'domain'
          },
          yaxis: {
            visible: false,
            showgrid: false,
            zeroline: false,
            showticklabels: false,
            showline: false,
            range: [-0.5, numRows - 0.5], // Exact range to avoid padding
            constrain: 'domain',
            autorange: 'reversed' // Keep same orientation as display
          }
        };

        const cleanConfig: Partial<Plotly.Config> = {
          staticPlot: true,
          displayModeBar: false
        };

        // Render the clean plot
        await Plotly.newPlot(tempDiv, [cleanTrace], cleanLayout, cleanConfig);

        // Export at full resolution - 1 data point = 1 pixel
        const dataUrl = await Plotly.toImage(tempDiv, {
          format: 'png',
          width: exportWidth,
          height: exportHeight,
          scale: 1 // 1:1 pixel ratio for full resolution
        });

        // Clean up
        Plotly.purge(tempDiv);
        document.body.removeChild(tempDiv);

        return dataUrl;
      } catch (error) {
        console.error('Error exporting clean heatmap:', error);
        return null;
      }
    }
  }), [data, displaySettings]);

  // Render the heatmap
  const renderPlot = useCallback(async () => {
    if (!plotRef.current || !data || !Plotly) return;

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

    // Build filename annotations for composite scans
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (displaySettings.showFilenames && data.sourceRegions && data.sourceRegions.length > 0) {
      data.sourceRegions.forEach((region) => {
        // Strip file extension for cleaner display
        const displayName = region.filename.replace(/\.[^/.]+$/, '');
        annotations.push({
          x: region.centerX,
          y: region.centerY,
          xref: 'x',
          yref: 'y',
          text: displayName,
          showarrow: false,
          font: {
            size: 12,
            color: '#ffffff',
            family: 'Arial, sans-serif'
          },
          bgcolor: 'rgba(0, 0, 0, 0.6)',
          bordercolor: 'rgba(255, 255, 255, 0.3)',
          borderwidth: 1,
          borderpad: 4
        });
      });
    }

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
      hovermode: 'closest',
      annotations: annotations.length > 0 ? annotations : undefined
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
    if (plotlyLoaded) {
      renderPlot();
    }

    return () => {
      if (plotRef.current && Plotly) {
        Plotly.purge(plotRef.current);
      }
    };
  }, [renderPlot, plotlyLoaded]);

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
      {!plotlyLoaded ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-white text-opacity-70">Loading visualization...</div>
        </div>
      ) : (
        <div
          ref={plotRef}
          className="w-full h-full"
        />
      )}
    </div>
  );
});

export default CanvasViewport;