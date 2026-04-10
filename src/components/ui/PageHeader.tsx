import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  icon?: ReactNode;
}

export function PageHeader({ title, subtitle, icon }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '32px 40px 0' }}>
      {icon && (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--accent-primary), rgba(110, 160, 255, 1))',
            display: 'grid',
            placeItems: 'center',
            color: 'white',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 600, lineHeight: 1.2, color: 'rgba(255, 255, 255, 0.95)', margin: 0 }}>
          {title}
        </h1>
        <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.75)', fontWeight: 300, margin: 0 }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}
