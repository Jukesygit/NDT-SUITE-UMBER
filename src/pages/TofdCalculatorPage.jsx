import { useEffect, useRef } from 'react';
import tofdCalculator from '../tools/tofd-calculator.js';

function TofdCalculatorPage() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            tofdCalculator.init(containerRef.current);
        }

        return () => {
            if (tofdCalculator.destroy) {
                tofdCalculator.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default TofdCalculatorPage;
