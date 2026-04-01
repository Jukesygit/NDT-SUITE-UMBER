/**
 * Tests for EmptyState and NoSearchResults components.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState, NoSearchResults } from '../ui/EmptyState';

describe('EmptyState', () => {
    it('renders with default props', () => {
        render(<EmptyState />);
        expect(screen.getByText('No data found')).toBeInTheDocument();
        expect(screen.getByText('There is nothing to display here yet.')).toBeInTheDocument();
    });

    it('renders with custom title and message', () => {
        render(
            <EmptyState
                title="No competencies"
                message="Add a competency to get started"
            />,
        );
        expect(screen.getByText('No competencies')).toBeInTheDocument();
        expect(screen.getByText('Add a competency to get started')).toBeInTheDocument();
    });

    it('renders action button when provided', () => {
        const onClick = vi.fn();
        render(
            <EmptyState
                action={{ label: 'Add Item', onClick }}
            />,
        );
        const button = screen.getByText('Add Item');
        expect(button).toBeInTheDocument();
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not render action button when not provided', () => {
        render(<EmptyState />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<EmptyState className="custom-class" />);
        expect(container.firstChild).toHaveClass('custom-class');
    });

    it('renders SVG icon', () => {
        const { container } = render(<EmptyState icon="search" />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });
});

describe('NoSearchResults', () => {
    it('renders with search term', () => {
        render(<NoSearchResults searchTerm="foobar" />);
        expect(screen.getByText('No results found')).toBeInTheDocument();
        expect(screen.getByText(/foobar/)).toBeInTheDocument();
    });

    it('renders clear button when onClear provided', () => {
        const onClear = vi.fn();
        render(<NoSearchResults searchTerm="test" onClear={onClear} />);
        const button = screen.getByText('Clear Search');
        fireEvent.click(button);
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('does not render clear button when onClear not provided', () => {
        render(<NoSearchResults searchTerm="test" />);
        expect(screen.queryByText('Clear Search')).not.toBeInTheDocument();
    });
});
