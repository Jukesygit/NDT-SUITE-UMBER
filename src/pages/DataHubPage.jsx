import { useEffect, useRef } from 'react';
import dataHub from '../tools/data-hub.js';

function DataHubPage() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            dataHub.init(containerRef.current);
        }

        return () => {
            if (dataHub.destroy) {
                dataHub.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default DataHubPage;
