import BeamTool from '../components/BeamTool/BeamTool';

function BeamToolPage() {
  return (
    <div
      className="beamtool-page-wrapper"
      style={{
        marginTop: 'calc(-1 * var(--spacing-8, 2rem))',
        marginLeft: 'calc(50% - 50vw)',
        width: '100vw',
        height: 'calc(100vh - var(--header-height, 4rem))',
        maxWidth: 'none',
        overflow: 'hidden',
      }}
    >
      <BeamTool />
    </div>
  );
}

export default BeamToolPage;
