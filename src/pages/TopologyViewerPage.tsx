import TopologyViewer from '../components/TopologyViewer/TopologyViewer';

function TopologyViewerPage() {
  return (
    <div
      className="topology-page-wrapper"
      style={{
        marginTop: 'calc(-1 * var(--spacing-8, 2rem))',
        marginLeft: 'calc(50% - 50vw)',
        width: '100vw',
        height: 'calc(100vh - var(--header-height, 4rem))',
        maxWidth: 'none',
        overflow: 'hidden',
      }}
    >
      <TopologyViewer />
    </div>
  );
}

export default TopologyViewerPage;
