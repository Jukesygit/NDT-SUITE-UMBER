import { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';

interface DownloadItem {
    name: string;
    description: string;
    version: string;
    platform: string;
    fileName: string;
    fileSize: string;
}

const downloads: DownloadItem[] = [
    {
        name: 'Matrix NDT Companion',
        description:
            'Windows system tray application that enables NDE file discovery and C-scan export. Required for importing inspection data into the Vessel Modeler.',
        version: '1.0.0',
        platform: 'Windows 10/11',
        fileName: 'MatrixNDTCompanion-setup.exe',
        fileSize: '~25 MB',
    },
];

function DownloadCard({ item }: { item: DownloadItem }) {
    const [downloading, setDownloading] = useState(false);

    const handleDownload = () => {
        setDownloading(true);
        const link = document.createElement('a');
        link.href = `/downloads/${item.fileName}`;
        link.download = item.fileName;
        link.click();
        setTimeout(() => setDownloading(false), 2000);
    };

    return (
        <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div
                    style={{
                        flexShrink: 0,
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--accent-blue-subtle)',
                        border: '1px solid var(--accent-blue-glow)',
                        color: 'var(--accent-blue-bright)',
                    }}
                >
                    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                        />
                    </svg>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: 'rgba(255, 255, 255, 0.95)',
                        margin: 0,
                        lineHeight: 1.3,
                    }}>
                        {item.name}
                    </h3>
                    <p style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        lineHeight: 1.6,
                        margin: '8px 0 0',
                        fontWeight: 300,
                    }}>
                        {item.description}
                    </p>

                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginTop: '16px',
                    }}>
                        <span className="badge badge--primary">v{item.version}</span>
                        <span className="badge badge--neutral">{item.platform}</span>
                        <span className="badge badge--neutral">{item.fileSize}</span>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className={downloading ? 'btn btn--success' : 'btn btn--primary'}
                        >
                            {downloading ? (
                                <>
                                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Download started
                                </>
                            ) : (
                                <>
                                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DownloadsPage() {
    return (
        <div className="h-full overflow-y-auto glass-scrollbar">
            <PageHeader
                title="Downloads"
                subtitle="Desktop applications and companion tools for NDT Suite"
                icon={
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                }
            />

            <div style={{ padding: '24px 40px 32px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {downloads.map((item) => (
                    <DownloadCard key={item.fileName} item={item} />
                ))}
            </div>
        </div>
    );
}
