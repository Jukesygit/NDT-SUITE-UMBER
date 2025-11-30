import React, { useState } from 'react';
import UniversalImportModal from './components/UniversalImportModal.jsx';

export default function TestImportModal() {
    const [showModal, setShowModal] = useState(false);

    return (
        <div style={{ padding: '40px', background: '#1a1a2e', minHeight: '100vh', color: 'white' }}>
            <h1>Test Import Modal</h1>

            <div style={{ margin: '20px 0' }}>
                <button
                    onClick={() => {
                        console.log('Test button clicked!');
                        setShowModal(true);
                    }}
                    style={{
                        padding: '10px 20px',
                        background: '#4a5568',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Open Import Modal
                </button>
            </div>

            <div>
                Modal state: {showModal ? 'OPEN' : 'CLOSED'}
            </div>

            {showModal && (
                <UniversalImportModal
                    onClose={() => {
                        console.log('Modal closed');
                        setShowModal(false);
                    }}
                    onComplete={() => {
                        console.log('Import complete');
                        setShowModal(false);
                    }}
                />
            )}
        </div>
    );
}