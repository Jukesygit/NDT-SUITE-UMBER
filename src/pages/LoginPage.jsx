import { useEffect, useRef } from 'react';
import login from '../tools/login.js';

function LoginPage({ onLogin }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            // Initialize the login tool
            login.init(containerRef.current, onLogin);
        }

        return () => {
            // Cleanup if needed
            if (login.destroy) {
                login.destroy(containerRef.current);
            }
        };
    }, [onLogin]);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default LoginPage;
