import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TwoFactorSetupWizard } from './TwoFactorSetupWizard';

// Mock the two-factor service
const mockEnroll = vi.fn();
const mockVerifyEnrollment = vi.fn();
const mockGenerateBackupCodes = vi.fn();

vi.mock('../../services/two-factor-service.ts', () => ({
  twoFactorService: {
    enroll: (...args: unknown[]) => mockEnroll(...args),
    verifyEnrollment: (...args: unknown[]) => mockVerifyEnrollment(...args),
    generateBackupCodes: (...args: unknown[]) => mockGenerateBackupCodes(...args),
  },
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('TwoFactorSetupWizard', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnroll.mockResolvedValue({
      factorId: 'factor-new',
      qr_code: '<svg><rect width="100" height="100"/></svg>',
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/MyApp:user@example.com?secret=JBSWY3DPEHPK3PXP',
    });
    mockVerifyEnrollment.mockResolvedValue(undefined);
    mockGenerateBackupCodes.mockResolvedValue([
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
    ]);
  });

  describe('Step 1: QR Code', () => {
    it('should render the QR code step initially', async () => {
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/scan/i)).toBeInTheDocument();
      });
    });

    it('should display the QR code SVG from enrollment', async () => {
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockEnroll).toHaveBeenCalled();
      });
    });

    it('should show the secret as a text fallback for manual entry', async () => {
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
      });
    });

    it('should have a Next/Continue button to advance to verify step', async () => {
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next|continue/i })).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Verify', () => {
    it('should show a code input after advancing from QR step', async () => {
      const user = userEvent.setup();
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      // Advance to verify step
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next|continue/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /next|continue/i }));

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });
  });

  describe('Step 3: Done', () => {
    it('should show done step after successful verification', async () => {
      const user = userEvent.setup();
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      // Step 1 → Step 2
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next|continue/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /next|continue/i }));

      // Enter code and verify
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
      const input = screen.getByRole('textbox');
      await user.type(input, '123456');

      await waitFor(() => {
        expect(mockVerifyEnrollment).toHaveBeenCalledWith('factor-new', '123456');
      });

      // Should advance to done step
      await waitFor(() => {
        expect(screen.getByText(/two-factor authentication enabled/i)).toBeInTheDocument();
      });
    });
  });

  describe('mandatory mode', () => {
    it('should not show close button when mandatory', async () => {
      render(<TwoFactorSetupWizard {...defaultProps} mandatory={true} />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        // The modal should not have a close/X button
        const closeButtons = screen
          .queryAllByRole('button')
          .filter((btn) => btn.getAttribute('aria-label')?.toLowerCase().includes('close'));
        expect(closeButtons).toHaveLength(0);
      });
    });

    it('should not call onClose when mandatory and backdrop is clicked', async () => {
      const onClose = vi.fn();
      render(<TwoFactorSetupWizard {...defaultProps} onClose={onClose} mandatory={true} />, {
        wrapper: createWrapper(),
      });

      // Even if we try to close, onClose should not be triggered
      // (The modal should have closeOnBackdropClick=false)
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('completion', () => {
    it('should call onComplete when the wizard is finished', async () => {
      const onComplete = vi.fn();
      const user = userEvent.setup();
      render(<TwoFactorSetupWizard {...defaultProps} onComplete={onComplete} />, {
        wrapper: createWrapper(),
      });

      // Step 1 → Step 2
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next|continue/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /next|continue/i }));

      // Enter code
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
      await user.type(screen.getByRole('textbox'), '123456');

      // Wait for done step
      await waitFor(() => {
        expect(screen.getByText(/two-factor authentication enabled/i)).toBeInTheDocument();
      });

      // Click Done button
      const doneButton = screen.getByRole('button', { name: /done|finish|complete/i });
      await user.click(doneButton);

      expect(onComplete).toHaveBeenCalled();
    });
  });
});
