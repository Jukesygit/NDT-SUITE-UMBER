import React from 'react';
import viewer3D from '../tools/3d-viewer.js';
import ToolContainer from '../components/ToolContainer';

function Viewer3DPage() {
    return <ToolContainer toolModule={viewer3D} className="viewer-3d" />;
}

export default Viewer3DPage;
