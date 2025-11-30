import React from 'react';
import niiCalculator from '../tools/nii-coverage-calculator.js';
import ToolContainer from '../components/ToolContainer';

function NiiCalculatorPage() {
    return <ToolContainer toolModule={niiCalculator} />;
}

export default NiiCalculatorPage;
