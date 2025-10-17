import { useEffect, useRef } from 'react';
import cscanVisualizer from '../tools/cscan-visualizer.js';

function CscanVisualizerPage() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            cscanVisualizer.init(containerRef.current);
        }

        return () => {
            if (cscanVisualizer.destroy) {
                cscanVisualizer.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default CscanVisualizerPage;
