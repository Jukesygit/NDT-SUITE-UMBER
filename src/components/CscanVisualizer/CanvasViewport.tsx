import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState, useMemo } from 'react';
import { CscanData, Tool, DisplaySettings } from './types';
import { downsampleForDisplay, needsDownsampling } from './utils/downsample';

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

  // Track last rendered data ID to avoid unnecessary full re-renders
  const lastDataIdRef = useRef<string | null>(null);
  // Debounce timer for style updates
  const styleUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Downsample large datasets for display (prevents OOM)
  // Full resolution is still used for exports
  const displayData = useMemo(() => {
    if (!data) return null;

    const width = data.data[0]?.length ?? 0;
    const height = data.data.length;

    // Check if downsampling is needed
    if (needsDownsampling(width, height)) {
      const downsampled = downsampleForDisplay(data.data, data.xAxis, data.yAxis);
      console.log(`Display data downsampled: ${width}x${height} -> ${downsampled.data[0]?.length}x${downsampled.data.length}`);
      return {
        zData: downsampled.data,
        xAxis: downsampled.xAxis,
        yAxis: downsampled.yAxis,
        isDownsampled: true,
        scale: downsampled.scale
      };
    }

    // No downsampling needed
    return {
      zData: data.data,
      xAxis: data.xAxis,
      yAxis: data.yAxis,
      isDownsampled: false,
      scale: 1
    };
  }, [data]);

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

  // Full render - only called when data changes (not on settings changes)
  const renderFullPlot = useCallback(async () => {
    if (!plotRef.current || !data || !displayData || !Plotly) return;

    // IMPORTANT: Set this FIRST before any async work
    // This prevents re-triggering full render on settings changes during initial render
    lastDataIdRef.current = data.id;

    // Cancel any pending style updates
    if (styleUpdateTimerRef.current) {
      clearTimeout(styleUpdateTimerRef.current);
      styleUpdateTimerRef.current = null;
    }

    // Use downsampled data for display (prevents OOM)
    const { zData, xAxis, yAxis, isDownsampled, scale } = displayData;
    const { min, max } = displaySettings.range;
    const zMin = min ?? data.stats?.min ?? 0;
    const zMax = max ?? data.stats?.max ?? 1;

    // Log if using downsampled data
    if (isDownsampled) {
      console.log(`Rendering with ${scale}x downsampled data for display`);
    }

    const trace: Partial<Plotly.Data> = {
      type: 'heatmap',
      z: zData,
      x: xAxis,
      y: yAxis,
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
        const displayName = region.filename.replace(/\.[^/.]+$/, '');
        annotations.push({
          x: region.centerX,
          y: region.centerY,
          xref: 'x',
          yref: 'y',
          text: displayName,
          showarrow: false,
          font: { size: 12, color: '#ffffff', family: 'Arial, sans-serif' },
          bgcolor: 'rgba(0, 0, 0, 0.6)',
          bordercolor: 'rgba(255, 255, 255, 0.3)',
          borderwidth: 1,
          borderpad: 4
        });
      });
    }

    // Add indicator if displaying downsampled preview
    const titleText = isDownsampled
      ? `${data.filename || 'C-Scan Heatmap'} (Preview ${scale}x)`
      : (data.filename || 'C-Scan Heatmap');

    const layout: Partial<Plotly.Layout> = {
      autosize: true,
      margin: { l: 60, r: 80, t: 30, b: 50 },
      title: {
        text: titleText,
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

    // Ensure ref is set after async work completes (belt and suspenders)
    lastDataIdRef.current = data.id;

    setTimeout(() => {
      if (plotRef.current) {
        Plotly.Plots.resize(plotRef.current);
      }
    }, 100);
  }, [data, displayData]); // Depends on data and displayData (downsampled version)

  // Lightweight update - only restyle/relayout, doesn't reload data
  // This is debounced to prevent rapid-fire updates during slider drag
  const updatePlotStyleDebounced = useCallback(() => {
    // Cancel any pending update
    if (styleUpdateTimerRef.current) {
      clearTimeout(styleUpdateTimerRef.current);
    }

    // Debounce: wait 50ms before applying style changes
    styleUpdateTimerRef.current = setTimeout(async () => {
      if (!plotRef.current || !data || !Plotly) return;

      const { min, max } = displaySettings.range;
      const zMin = min ?? data.stats?.min ?? 0;
      const zMax = max ?? data.stats?.max ?? 1;

      console.log(`Restyle: zMin=${zMin}, zMax=${zMax}`);

      try {
        // Use restyle for color-related changes (lightweight, no data copy)
        await Plotly.restyle(plotRef.current, {
          colorscale: [displaySettings.colorScale],
          reversescale: [displaySettings.reverseScale],
          zmin: [zMin],
          zmax: [zMax],
          zsmooth: [displaySettings.smoothing === 'none' ? false : displaySettings.smoothing]
        }, [0]);

        // Use relayout for layout changes
        await Plotly.relayout(plotRef.current, {
          'xaxis.showgrid': displaySettings.showGrid,
          'yaxis.showgrid': displaySettings.showGrid,
          dragmode: activeTool === 'pan' ? 'pan' : 'zoom'
        });
      } catch (err) {
        console.warn('Plot style update failed:', err);
      }
    }, 50);
  }, [data, displaySettings, activeTool]);

  // Smart render - full render only when data changes, debounced restyle for settings
  const renderPlot = useCallback(() => {
    if (!plotRef.current || !data || !Plotly) return;

    // Check if this is new data or just a settings change
    if (lastDataIdRef.current !== data.id) {
      // New data - need full render (async but we don't await)
      console.log(`renderPlot: NEW DATA (ref=${lastDataIdRef.current}, data.id=${data.id})`);
      renderFullPlot();
    } else {
      // Same data - debounced style update (much faster, no OOM risk)
      console.log(`renderPlot: SETTINGS CHANGE -> restyle`);
      updatePlotStyleDebounced();
    }
  }, [data, renderFullPlot, updatePlotStyleDebounced]);

  // Initialize and update plot when renderPlot changes
  useEffect(() => {
    if (plotlyLoaded) {
      renderPlot();
    }
  }, [renderPlot, plotlyLoaded]);

  // Cleanup only on unmount - NOT on every settings change
  useEffect(() => {
    return () => {
      // Clear any pending debounced updates
      if (styleUpdateTimerRef.current) {
        clearTimeout(styleUpdateTimerRef.current);
        styleUpdateTimerRef.current = null;
      }
      if (plotRef.current && Plotly) {
        Plotly.purge(plotRef.current);
        lastDataIdRef.current = null; // Reset so next mount does full render
      }
    };
  }, []); // Empty deps = only runs on unmount

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