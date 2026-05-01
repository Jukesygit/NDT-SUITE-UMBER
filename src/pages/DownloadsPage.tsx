import { useState } from 'react';

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
        <div style={{
            background: 'rgba(0, 0, 0, 0.20)',
            border: '1px solid rgba(53, 160, 88, 0.10)',
            borderRadius: '4px',
            padding: '16px 18px',
        }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 4,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(53, 160, 88, 0.10)',
                    color: 'rgba(53, 160, 88, 0.60)',
                }}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'rgba(53, 160, 88, 0.70)',
                        textShadow: '0 0 6px var(--green-glow-soft)',
                        margin: 0,
                    }}>
                        {item.name}
                    </h3>
                    <p style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'rgba(53, 160, 88, 0.45)',
                        lineHeight: 1.6,
                        margin: '6px 0 0',
                    }}>
                        {item.description}
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                        {[`v${item.version}`, item.platform, item.fileSize].map((label) => (
                            <span key={label} style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '9px',
                                fontWeight: 600,
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.04em',
                                padding: '2px 8px',
                                borderRadius: '3px',
                                background: 'rgba(53, 160, 88, 0.08)',
                                color: 'rgba(53, 160, 88, 0.55)',
                            }}>
                                {label}
                            </span>
                        ))}
                    </div>

                    <div style={{ marginTop: '14px' }}>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontFamily: 'var(--font-label)',
                                fontSize: '10px',
                                fontWeight: 600,
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.10em',
                                padding: '6px 14px',
                                borderRadius: '5px',
                                border: 'none',
                                cursor: downloading ? 'default' : 'pointer',
                                background: downloading
                                    ? 'rgba(53, 160, 88, 0.15)'
                                    : 'linear-gradient(180deg, var(--green-bright) 0%, var(--green) 50%, var(--green-dark) 100%)',
                                color: downloading ? 'rgba(53, 160, 88, 0.70)' : '#fff',
                                textShadow: downloading ? '0 0 6px var(--green-glow-soft)' : '0 1px 2px rgba(0,0,0,0.30)',
                                boxShadow: downloading ? 'none' : '0 2px 6px rgba(45, 138, 78, 0.30)',
                            }}
                        >
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {downloading ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                )}
                            </svg>
                            {downloading ? 'Download started' : 'Download'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DownloadsPage() {
    return (
        <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
            <div style={{
                padding: '10px',
                borderRadius: '14px',
                margin: '24px 28px',
                background: 'linear-gradient(180deg, var(--chassis-inner) 0%, var(--chassis) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.20), 0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)',
            }}>
                <div style={{
                    borderRadius: '8px',
                    padding: '28px 32px 24px',
                    position: 'relative' as const,
                    overflow: 'hidden',
                    background: 'linear-gradient(180deg, var(--panel-top) 0%, var(--panel-mid) 45%, var(--panel-bot) 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.08)',
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' as const, zIndex: 1 }}>
                        <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: 'radial-gradient(circle at 35% 30%, #5ec87a, var(--green) 55%, var(--green-dark))',
                            boxShadow: '0 0 4px var(--green-glow), 0 0 14px var(--green-glow-soft)',
                        }} />
                        <div>
                            <h1 style={{
                                fontFamily: 'var(--font-label)', fontSize: '17px', fontWeight: 700,
                                textTransform: 'uppercase' as const, letterSpacing: '0.16em',
                                color: 'var(--color-neutral-700)', textShadow: '0 1px 0 rgba(255,255,255,0.50)', margin: 0,
                            }}>Downloads</h1>
                            <p style={{
                                fontFamily: 'var(--font-label)', fontSize: '11px', fontWeight: 600,
                                textTransform: 'uppercase' as const, letterSpacing: '0.12em',
                                color: 'var(--color-neutral-400)', textShadow: '0 1px 0 rgba(255,255,255,0.35)', margin: 0,
                            }}>Desktop applications and companion tools</p>
                        </div>
                    </div>

                    {/* Groove */}
                    <div style={{
                        height: '2px', margin: '22px -8px',
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.10) 50%, rgba(255,255,255,0.40) 100%)',
                        boxShadow: '0 1px 0 rgba(255,255,255,0.18), 0 -1px 0 rgba(0,0,0,0.06)',
                    }} />

                    {/* Section label */}
                    <div style={{
                        fontFamily: 'var(--font-label)', fontSize: '10px', fontWeight: 700,
                        textTransform: 'uppercase' as const, letterSpacing: '0.14em',
                        color: 'var(--color-neutral-500)', textShadow: '0 1px 0 rgba(255,255,255,0.45)',
                        marginBottom: '12px', position: 'relative' as const, zIndex: 1,
                    }}>Available Software</div>

                    {/* Display well */}
                    <div style={{
                        borderRadius: '7px', padding: '4px', position: 'relative' as const, zIndex: 1,
                        background: 'radial-gradient(ellipse at 50% 95%, rgba(255,255,255,0.02) 0%, transparent 50%), linear-gradient(180deg, var(--well-mid) 0%, var(--well-deep) 30%, var(--well-floor) 100%)',
                        boxShadow: 'inset 0 5px 14px rgba(0,0,0,0.38), inset 0 2px 4px rgba(0,0,0,0.28), inset 0 -2px 5px rgba(255,255,255,0.03), 0 1px 0 rgba(255,255,255,0.32)',
                    }}>
                        <div style={{
                            borderRadius: '4px', padding: '14px 16px',
                            background: 'linear-gradient(180deg, #131210 0%, #0c0b0a 100%)',
                            display: 'flex', flexDirection: 'column' as const, gap: '8px',
                        }}>
                            {downloads.map((item) => (
                                <DownloadCard key={item.fileName} item={item} />
                            ))}
                        </div>
                    </div>

                    {/* Groove + Nameplate */}
                    <div style={{
                        height: '2px', margin: '22px -8px',
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.10) 50%, rgba(255,255,255,0.40) 100%)',
                        boxShadow: '0 1px 0 rgba(255,255,255,0.18), 0 -1px 0 rgba(0,0,0,0.06)',
                    }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', position: 'relative' as const, zIndex: 1 }}>
                        <span style={{
                            fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: '15px',
                            textTransform: 'uppercase' as const, letterSpacing: '0.18em',
                            color: 'var(--color-neutral-500)', textShadow: '0 1px 0 rgba(255,255,255,0.40)',
                        }}>Matrix Portal</span>
                        <span style={{
                            fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: '11px',
                            textTransform: 'uppercase' as const, letterSpacing: '0.12em',
                            color: 'var(--color-neutral-400)', textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                        }}>Downloads</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
