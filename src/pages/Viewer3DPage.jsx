import { useEffect, useRef } from 'react';
import viewer3D from '../tools/3d-viewer.js';

function Viewer3DPage() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            viewer3D.init(containerRef.current);
        }

        return () => {
            if (viewer3D.destroy) {
                viewer3D.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full relative"></div>;
}

export default Viewer3DPage;
