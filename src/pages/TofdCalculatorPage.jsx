import React from 'react';
import tofdCalculator from '../tools/tofd-calculator.js';
import ToolContainer from '../components/ToolContainer';

function TofdCalculatorPage() {
    return <ToolContainer toolModule={tofdCalculator} />;
}

export default TofdCalculatorPage;
