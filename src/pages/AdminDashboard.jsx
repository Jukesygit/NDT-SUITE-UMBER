import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import adminDashboard from '../tools/admin-dashboard.js';
import authManager from '../auth-manager.js';

function AdminDashboard() {
    const containerRef = useRef(null);

    // Check if user is admin
    if (!authManager.isAdmin()) {
        return <Navigate to="/" replace />;
    }

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
