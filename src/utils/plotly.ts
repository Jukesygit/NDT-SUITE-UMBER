// Plotly wrapper for lazy loading
import Plotly from 'plotly.js-dist-min';

// Export Plotly for use in components
export default Plotly;

// Helper function to create plots
export const createPlot = (element: HTMLElement, data: Plotly.Data[], layout: Partial<Plotly.Layout>, config: Partial<Plotly.Config> = {}) => {
  return Plotly.newPlot(element, data, layout, config);
};

// Helper function to update plots
export const updatePlot = (element: HTMLElement, data: Plotly.Data[], layout: Partial<Plotly.Layout>) => {
  return Plotly.react(element, data, layout);
};

// Helper function to purge plots (cleanup)
export const purgePlot = (element: HTMLElement) => {
  return Plotly.purge(element);
};
