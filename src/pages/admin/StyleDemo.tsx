/**
 * Admin Dashboard Style Demo
 * Option A (Cyber Teal) + More Adventurous Variations
 */

import { useState } from 'react';

const demoStats = [
    { label: 'Organizations', value: 12, change: '+2' },
    { label: 'Total Users', value: 156, change: '+8' },
    { label: 'Total Assets', value: 2847, change: '+124' },
    { label: 'Pending Requests', value: 5, change: '-3' },
];

const demoOrgs = [
    { name: 'Oceanic Industries', assets: 847, scans: 12340 },
    { name: 'Nordic Offshore AS', assets: 523, scans: 8920 },
    { name: 'Pacific Inspection Co', assets: 412, scans: 6750 },
];

const demoUsers = [
    { name: 'Jonas Martinsen', email: 'jonas@example.com', role: 'admin', active: true },
    { name: 'Sarah Chen', email: 'sarah@example.com', role: 'editor', active: true },
    { name: 'Mike Johnson', email: 'mike@example.com', role: 'viewer', active: false },
];

// ============================================================================
// OPTION A: Cyber Teal (Your Favorite)
// ============================================================================
function StyleOptionA() {
    const p = { primary: '#14b8a6', accent: '#06b6d4', bg: '#111827', cardBg: '#1f2937', border: '#374151' };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="grid grid-cols-4 gap-4">
                {demoStats.map((stat, i) => (
                    <div key={i} style={{
                        background: `linear-gradient(135deg, ${p.cardBg} 0%, ${p.bg} 100%)`,
                        border: `1px solid ${p.border}50`,
                        borderRadius: '12px',
                        padding: '20px',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '80px', height: '80px', borderRadius: '50%', background: `${p.primary}20` }} />
                        <p style={{ color: p.primary, fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>{stat.label}</p>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                            <p style={{ color: 'white', fontSize: '28px', fontWeight: 700 }}>{stat.value.toLocaleString()}</p>
                            <span style={{ color: stat.change.startsWith('+') ? '#34d399' : '#f87171', fontSize: '14px' }}>{stat.change}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div style={{ background: `${p.cardBg}e0`, border: `1px solid ${p.border}50`, borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${p.primary}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg style={{ width: '16px', height: '16px', color: p.primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <h4 style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>Organizations</h4>
                    </div>
                    {demoOrgs.map((org, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: `${p.bg}80`, borderRadius: '8px', marginBottom: '8px', borderLeft: `3px solid ${p.primary}` }}>
                            <div>
                                <p style={{ color: 'white', fontWeight: 500 }}>{org.name}</p>
                                <p style={{ color: '#9ca3af', fontSize: '14px' }}>{org.assets} assets</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ color: p.primary, fontWeight: 600 }}>{org.scans.toLocaleString()}</p>
                                <p style={{ color: '#6b7280', fontSize: '12px' }}>scans</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ background: `${p.cardBg}e0`, border: `1px solid ${p.border}50`, borderRadius: '12px', padding: '20px' }}>
                    <h4 style={{ color: 'white', fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Recent Users</h4>
                    {demoUsers.map((user, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: `${p.bg}80`, borderRadius: '8px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `linear-gradient(135deg, ${p.primary}, ${p.accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>{user.name.charAt(0)}</div>
                                <div>
                                    <p style={{ color: 'white', fontWeight: 500 }}>{user.name}</p>
                                    <p style={{ color: '#9ca3af', fontSize: '13px' }}>{user.email}</p>
                                </div>
                            </div>
                            <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 500, background: user.role === 'admin' ? '#8b5cf620' : '#3b82f620', color: user.role === 'admin' ? '#a78bfa' : '#60a5fa' }}>{user.role}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// OPTION B: Neon Pulse - Cyberpunk with glowing effects
// ============================================================================
function StyleOptionB() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="grid grid-cols-4 gap-4">
                {demoStats.map((stat, i) => {
                    const colors = ['#ff006e', '#8338ec', '#3a86ff', '#06ffa5'][i];
                    return (
                        <div key={i} style={{
                            background: '#0a0a0f',
                            border: `1px solid ${colors}40`,
                            borderRadius: '8px',
                            padding: '20px',
                            position: 'relative',
                            boxShadow: `0 0 30px ${colors}15, inset 0 1px 0 ${colors}20`,
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${colors}, transparent)` }} />
                            <p style={{ color: colors, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>{stat.label}</p>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                <p style={{ color: 'white', fontSize: '32px', fontWeight: 800, textShadow: `0 0 20px ${colors}50` }}>{stat.value.toLocaleString()}</p>
                                <span style={{ color: stat.change.startsWith('+') ? '#06ffa5' : '#ff006e', fontSize: '14px', fontWeight: 600 }}>{stat.change}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div style={{ background: '#0a0a0f', border: '1px solid #8338ec30', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 0 40px #8338ec10' }}>
                    <div style={{ padding: '16px 20px', background: 'linear-gradient(90deg, #8338ec20, #3a86ff20)', borderBottom: '1px solid #8338ec30' }}>
                        <h4 style={{ color: '#a78bfa', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Organizations</h4>
                    </div>
                    <div style={{ padding: '16px' }}>
                        {demoOrgs.map((org, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#12121a', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ffffff08' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'linear-gradient(135deg, #8338ec, #3a86ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '16px', boxShadow: '0 0 20px #8338ec40' }}>{org.name.charAt(0)}</div>
                                    <div>
                                        <p style={{ color: 'white', fontWeight: 600 }}>{org.name}</p>
                                        <p style={{ color: '#6b7280', fontSize: '13px' }}>{org.assets} assets</p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ color: '#06ffa5', fontSize: '18px', fontWeight: 700, textShadow: '0 0 10px #06ffa540' }}>{org.scans.toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ background: '#0a0a0f', border: '1px solid #ff006e30', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 0 40px #ff006e10' }}>
                    <div style={{ padding: '16px 20px', background: 'linear-gradient(90deg, #ff006e20, #8338ec20)', borderBottom: '1px solid #ff006e30' }}>
                        <h4 style={{ color: '#ff6b9d', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Users</h4>
                    </div>
                    <div style={{ padding: '16px' }}>
                        {demoUsers.map((user, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#12121a', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ffffff08' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #ff006e, #8338ec)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, boxShadow: '0 0 15px #ff006e40' }}>{user.name.charAt(0)}</div>
                                    <div>
                                        <p style={{ color: 'white', fontWeight: 600 }}>{user.name}</p>
                                        <p style={{ color: '#6b7280', fontSize: '13px' }}>{user.email}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', background: user.role === 'admin' ? '#ff006e25' : '#3a86ff25', color: user.role === 'admin' ? '#ff6b9d' : '#60a5fa', border: `1px solid ${user.role === 'admin' ? '#ff006e40' : '#3a86ff40'}` }}>{user.role}</span>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: user.active ? '#06ffa5' : '#4b5563', boxShadow: user.active ? '0 0 10px #06ffa5' : 'none' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// OPTION C: Glass Morphism - Frosted glass with depth
// ============================================================================
function StyleOptionC() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
            {/* Background blobs */}
            <div style={{ position: 'absolute', top: '-100px', left: '-100px', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, #14b8a640 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '-50px', right: '-50px', width: '250px', height: '250px', borderRadius: '50%', background: 'radial-gradient(circle, #8b5cf640 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

            <div className="grid grid-cols-4 gap-4" style={{ position: 'relative' }}>
                {demoStats.map((stat, i) => (
                    <div key={i} style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        padding: '24px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                    }}>
                        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>{stat.label}</p>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                            <p style={{ color: 'white', fontSize: '36px', fontWeight: 300 }}>{stat.value.toLocaleString()}</p>
                            <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: stat.change.startsWith('+') ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)', color: stat.change.startsWith('+') ? '#6ee7b7' : '#fca5a5', marginBottom: '8px' }}>{stat.change}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-4" style={{ position: 'relative' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', padding: '24px', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)' }}>
                    <h4 style={{ color: 'white', fontSize: '16px', fontWeight: 500, marginBottom: '20px', opacity: 0.9 }}>Organizations</h4>
                    {demoOrgs.map((org, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', marginBottom: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.3), rgba(139, 92, 246, 0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 500, fontSize: '18px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>{org.name.charAt(0)}</div>
                            <div style={{ flex: 1 }}>
                                <p style={{ color: 'white', fontWeight: 500, marginBottom: '2px' }}>{org.name}</p>
                                <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>{org.assets} assets · {org.scans.toLocaleString()} scans</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', padding: '24px', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)' }}>
                    <h4 style={{ color: 'white', fontSize: '16px', fontWeight: 500, marginBottom: '20px', opacity: 0.9 }}>Recent Users</h4>
                    {demoUsers.map((user, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', marginBottom: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(236, 72, 153, 0.4))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 500, border: '1px solid rgba(255, 255, 255, 0.15)' }}>{user.name.charAt(0)}</div>
                                <div>
                                    <p style={{ color: 'white', fontWeight: 500 }}>{user.name}</p>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>{user.email}</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.7)' }}>{user.role}</span>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: user.active ? '#34d399' : 'rgba(255, 255, 255, 0.2)' }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// OPTION D: Dark Luxe - Premium gold accents on deep black
// ============================================================================
function StyleOptionD() {
    const gold = '#d4af37';
    const copper = '#b87333';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="grid grid-cols-4 gap-4">
                {demoStats.map((stat, i) => (
                    <div key={i} style={{
                        background: 'linear-gradient(145deg, #0d0d0d 0%, #1a1a1a 100%)',
                        border: '1px solid #2a2a2a',
                        borderRadius: '4px',
                        padding: '24px',
                        position: 'relative',
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: `linear-gradient(180deg, ${gold}, ${copper})` }} />
                        <p style={{ color: gold, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>{stat.label}</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <p style={{ color: '#ffffff', fontSize: '32px', fontWeight: 300, fontFamily: 'Georgia, serif' }}>{stat.value.toLocaleString()}</p>
                            <span style={{ color: stat.change.startsWith('+') ? '#4ade80' : '#f87171', fontSize: '13px', fontWeight: 500 }}>{stat.change}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', borderBottom: `1px solid ${gold}20`, background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.05), transparent)' }}>
                        <h4 style={{ color: gold, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Organizations</h4>
                    </div>
                    <div style={{ padding: '16px' }}>
                        {demoOrgs.map((org, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #1a1a1a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '44px', height: '44px', border: `1px solid ${gold}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: gold, fontWeight: 400, fontSize: '18px', fontFamily: 'Georgia, serif' }}>{org.name.charAt(0)}</div>
                                    <div>
                                        <p style={{ color: '#ffffff', fontWeight: 400, fontSize: '15px' }}>{org.name}</p>
                                        <p style={{ color: '#666', fontSize: '13px' }}>{org.assets} assets</p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ color: gold, fontSize: '16px', fontWeight: 500 }}>{org.scans.toLocaleString()}</p>
                                    <p style={{ color: '#444', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>scans</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', borderBottom: `1px solid ${gold}20`, background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.05), transparent)' }}>
                        <h4 style={{ color: gold, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Recent Users</h4>
                    </div>
                    <div style={{ padding: '16px' }}>
                        {demoUsers.map((user, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #1a1a1a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: `1px solid ${gold}30`, background: `linear-gradient(135deg, ${gold}10, ${copper}10)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: gold, fontWeight: 400, fontFamily: 'Georgia, serif' }}>{user.name.charAt(0)}</div>
                                    <div>
                                        <p style={{ color: '#ffffff', fontWeight: 400, fontSize: '15px' }}>{user.name}</p>
                                        <p style={{ color: '#666', fontSize: '13px' }}>{user.email}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ padding: '5px 14px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', border: `1px solid ${user.role === 'admin' ? gold + '50' : '#333'}`, color: user.role === 'admin' ? gold : '#888' }}>{user.role}</span>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: user.active ? '#4ade80' : '#333' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// OPTION E: Aurora - Northern lights inspired gradients
// ============================================================================
function StyleOptionE() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
            <div className="grid grid-cols-4 gap-4">
                {demoStats.map((stat, i) => {
                    const gradients = [
                        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                    ];
                    return (
                        <div key={i} style={{
                            background: '#0f0f1a',
                            borderRadius: '16px',
                            padding: '24px',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: gradients[i] }} />
                            <div style={{ position: 'absolute', top: '4px', left: 0, right: 0, height: '40px', background: gradients[i], opacity: 0.1, filter: 'blur(20px)' }} />
                            <p style={{ color: '#a5b4fc', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>{stat.label}</p>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                                <p style={{ color: 'white', fontSize: '34px', fontWeight: 700 }}>{stat.value.toLocaleString()}</p>
                                <span style={{ color: stat.change.startsWith('+') ? '#34d399' : '#fb7185', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>{stat.change}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div style={{ background: '#0f0f1a', borderRadius: '20px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100px', background: 'linear-gradient(180deg, rgba(102, 126, 234, 0.15), transparent)', pointerEvents: 'none' }} />
                    <div style={{ padding: '20px 24px', position: 'relative' }}>
                        <h4 style={{ color: '#a5b4fc', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Organizations</h4>
                        {demoOrgs.map((org, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', marginBottom: '10px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '18px' }}>{org.name.charAt(0)}</div>
                                <div style={{ flex: 1 }}>
                                    <p style={{ color: 'white', fontWeight: 500 }}>{org.name}</p>
                                    <p style={{ color: '#6b7280', fontSize: '13px' }}>{org.assets} assets</p>
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700, fontSize: '18px' }}>{org.scans.toLocaleString()}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ background: '#0f0f1a', borderRadius: '20px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100px', background: 'linear-gradient(180deg, rgba(240, 147, 251, 0.12), transparent)', pointerEvents: 'none' }} />
                    <div style={{ padding: '20px 24px', position: 'relative' }}>
                        <h4 style={{ color: '#f9a8d4', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Recent Users</h4>
                        {demoUsers.map((user, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #f093fb, #f5576c)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>{user.name.charAt(0)}</div>
                                    <div>
                                        <p style={{ color: 'white', fontWeight: 500 }}>{user.name}</p>
                                        <p style={{ color: '#6b7280', fontSize: '13px' }}>{user.email}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ padding: '5px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: user.role === 'admin' ? 'linear-gradient(135deg, #667eea20, #764ba220)' : 'rgba(255,255,255,0.05)', color: user.role === 'admin' ? '#a5b4fc' : '#9ca3af' }}>{user.role}</span>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: user.active ? 'linear-gradient(135deg, #43e97b, #38f9d7)' : '#374151', boxShadow: user.active ? '0 0 10px #43e97b60' : 'none' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================
export default function StyleDemo() {
    const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');

    const options = {
        A: { name: 'Cyber Teal', color: '#14b8a6', desc: 'Your favorite - clean teal accents with subtle gradients' },
        B: { name: 'Neon Pulse', color: '#ff006e', desc: 'Cyberpunk aesthetic with glowing neon effects' },
        C: { name: 'Glass Morphism', color: '#8b5cf6', desc: 'Frosted glass with depth and floating elements' },
        D: { name: 'Dark Luxe', color: '#d4af37', desc: 'Premium gold accents on deep matte black' },
        E: { name: 'Aurora', color: '#667eea', desc: 'Northern lights inspired gradient overlays' },
    };

    return (
        <div style={{ minHeight: '100vh', padding: '32px', background: selectedOption === 'C' ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' : '#0a0a0f' }}>
            <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
                <h1 style={{ color: 'white', fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>Admin Dashboard Styles</h1>
                <p style={{ color: '#9ca3af', marginBottom: '32px' }}>Option A + More Adventurous Variations</p>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    {(['A', 'B', 'C', 'D', 'E'] as const).map((opt) => (
                        <button
                            key={opt}
                            onClick={() => setSelectedOption(opt)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                fontWeight: 500,
                                border: selectedOption === opt ? `2px solid ${options[opt].color}` : '2px solid transparent',
                                cursor: 'pointer',
                                background: selectedOption === opt ? `${options[opt].color}20` : '#1a1a1f',
                                color: selectedOption === opt ? options[opt].color : '#9ca3af',
                                boxShadow: selectedOption === opt ? `0 0 20px ${options[opt].color}30` : 'none',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: options[opt].color, boxShadow: `0 0 8px ${options[opt].color}60` }} />
                            {opt}: {options[opt].name}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: options[selectedOption].color, boxShadow: `0 0 12px ${options[selectedOption].color}` }} />
                    <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>{options[selectedOption].name}</h2>
                    <span style={{ color: '#6b7280' }}>— {options[selectedOption].desc}</span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '32px', marginBottom: '24px' }}>
                    {selectedOption === 'A' && <StyleOptionA />}
                    {selectedOption === 'B' && <StyleOptionB />}
                    {selectedOption === 'C' && <StyleOptionC />}
                    {selectedOption === 'D' && <StyleOptionD />}
                    {selectedOption === 'E' && <StyleOptionE />}
                </div>

                <p style={{ textAlign: 'center', color: '#4b5563', fontSize: '14px' }}>Select your preferred style and I'll apply it to the admin dashboard.</p>
            </div>
        </div>
    );
}
