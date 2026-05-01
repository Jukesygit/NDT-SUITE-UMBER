import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    children: ReactNode;
    defaultOpen?: boolean;
}

export default function CollapsibleSection({
    title,
    children,
    defaultOpen = true,
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="pj-collapsible" style={{ marginBottom: 16 }}>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="pj-collapsible-header"
            >
                <span className="pj-collapsible-title">{title}</span>
                <ChevronDown
                    size={14}
                    className="pj-collapsible-chevron"
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                />
            </button>

            {isOpen && (
                <div className="pj-collapsible-well">
                    <div className="pj-collapsible-body">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
}
