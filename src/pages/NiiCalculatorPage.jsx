import { useEffect, useRef } from 'react';
import niiCalculator from '../tools/nii-coverage-calculator.js';

function NiiCalculatorPage() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (containerRef.current) {
            niiCalculator.init(containerRef.current);
        }

        return () => {
            if (niiCalculator.destroy) {
                niiCalculator.destroy(containerRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="tool-container w-full h-full"></div>;
}

export default NiiCalculatorPage;
