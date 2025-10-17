import { useEffect, useRef } from 'react';
import profile from '../tools/profile.js';

function ProfilePage() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            profile.init(containerRef.current);
        }

        return () => {
            if (profile.destroy) {
                profile.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default ProfilePage;
