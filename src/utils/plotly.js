// Plotly wrapper for lazy loading
import Plotly from 'plotly.js-dist-min';

// Export Plotly for use in components
export default Plotly;

// Helper function to create plots
export const createPlot = (element, data, layout, config = {}) => {
  return Plotly.newPlot(element, data, layout, config);
};

// Helper function to update plots
export const updatePlot = (element, data, layout) => {
  return Plotly.react(element, data, layout);
};

// Helper function to purge plots (cleanup)
export const purgePlot = (element) => {
  return Plotly.purge(element);
};