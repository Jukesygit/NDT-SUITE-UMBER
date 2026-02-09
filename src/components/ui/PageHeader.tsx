interface PageHeaderProps {
  title: string;
  subtitle: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div
      className="relative px-8 py-6 flex-shrink-0 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 50%, rgba(51,65,85,0.85) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="relative z-10">
        <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-400 font-medium">{subtitle}</p>
      </div>
    </div>
  );
}
