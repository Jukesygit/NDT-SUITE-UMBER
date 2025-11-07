import React from 'react';
import login from '../tools/login.js';
import ToolContainer from '../components/ToolContainer';

function LoginPage({ onLogin }) {
    return <ToolContainer toolModule={login} onLogin={onLogin} />;
}

export default LoginPage;
