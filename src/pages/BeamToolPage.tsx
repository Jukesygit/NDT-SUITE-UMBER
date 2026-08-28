import BeamTool from '../components/BeamTool/BeamTool';

/**
 * BeamToolPage - Full-bleed page wrapper for the NotBeamTool UT technique designer.
 * `.tool-container` flips `.main` to padding:0/overflow:hidden via the layout.css
 * `:has()` rules (same mechanism as VesselModelerPage), so the document is exactly
 * 100vh tall and the page itself can never scroll — wheel events over the canvas
 * only zoom, and the tool sidebar keeps its own overflow-y scroller.
 */
function BeamToolPage() {
  return (
    <div
      className="tool-container beamtool-page-wrapper"
      style={{
        height: 'calc(100vh - var(--header-height, 4rem))',
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <BeamTool />
    </div>
  );
}

export default BeamToolPage;
