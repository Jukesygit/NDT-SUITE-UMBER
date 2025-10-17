import { useEffect, useRef } from 'react';
import adminDashboard from '../tools/admin-dashboard.js';

function AdminDashboard() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            adminDashboard.init(containerRef.current);
        }

        return () => {
            if (adminDashboard.destroy) {
                adminDashboard.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default AdminDashboard;
