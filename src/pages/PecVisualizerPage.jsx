import { useEffect, useRef } from 'react';
import pecVisualizer from '../tools/pec-visualizer.js';

function PecVisualizerPage() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            pecVisualizer.init(containerRef.current);
        }

        return () => {
            if (pecVisualizer.destroy) {
                pecVisualizer.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default PecVisualizerPage;
