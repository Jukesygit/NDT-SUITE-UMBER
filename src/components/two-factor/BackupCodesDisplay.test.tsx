import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupCodesDisplay } from './BackupCodesDisplay';

// Mock clipboard at module level
const mockWriteText = vi.fn();
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

describe('BackupCodesDisplay', () => {
  const mockCodes = [
    'ABCD-EFGH',
    'IJKL-MNOP',
    'QRST-UVWX',
    'YZAB-CDEF',
    'GHIJ-KLMN',
    'PQRS-TUVW',
    'XYZA-BCDE',
    'FGHI-JKLM',
    'NOPQ-RSTU',
    'VWXY-ZABC',
  ];

  beforeEach(() => {
    mockWriteText.mockResolvedValue(undefined);
  });

  describe('rendering', () => {
    it('should render all backup codes', () => {
      render(<BackupCodesDisplay codes={mockCodes} />);

      mockCodes.forEach((code) => {
        expect(screen.getByText(code)).toBeInTheDocument();
      });
    });

    it('should render codes in monospace font', () => {
      render(<BackupCodesDisplay codes={mockCodes} />);
      const codeElement = screen.getByText(mockCodes[0]);
      expect(codeElement.closest('[class*="mono"]') || codeElement).toBeTruthy();
    });

    it('should display warning message about single-use codes', () => {
      render(<BackupCodesDisplay codes={mockCodes} />);
      expect(screen.getByText(/store these securely/i)).toBeInTheDocument();
      expect(screen.getByText(/single-use/i)).toBeInTheDocument();
    });
  });

  describe('copy functionality', () => {
    it('should render a "Copy All" button', () => {
      render(<BackupCodesDisplay codes={mockCodes} />);
      expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();
    });

    it('should copy all codes to clipboard when "Copy All" is clicked', async () => {
      render(<BackupCodesDisplay codes={mockCodes} />);

      fireEvent.click(screen.getByRole('button', { name: /copy all/i }));

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(mockCodes.join('\n'));
      });
    });
  });

  describe('download functionality', () => {
    it('should render a "Download" button', () => {
      render(<BackupCodesDisplay codes={mockCodes} />);
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });

    it('should trigger file download when "Download" is clicked', async () => {
      const user = userEvent.setup();
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const a = originalCreateElement('a');
          a.click = mockClick;
          return a;
        }
        return originalCreateElement(tag);
      });

      render(<BackupCodesDisplay codes={mockCodes} />);
      await user.click(screen.getByRole('button', { name: /download/i }));

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });
  });
});
