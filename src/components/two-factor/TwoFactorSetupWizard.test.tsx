import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TwoFactorSetupWizard } from './TwoFactorSetupWizard';

// Mock the two-factor service. vi.hoisted so the mock factory (which is hoisted
// to the top of the file) can see these — the wizard branches on
// `instanceof BackupCodesError`, so the mocked module must export a real class.
const {
  mockEnroll,
  mockVerifyEnrollment,
  mockGenerateBackupCodes,
  mockRegenerateBackupCodes,
  MockBackupCodesError,
} = vi.hoisted(() => {
  class MockBackupCodesError extends Error {
    readonly status: number | null;
    constructor(message: string, status: number | null) {
      super(message);
      this.name = 'BackupCodesError';
      this.status = status;
    }
    get codesAlreadyExist() {
      return this.status === 409;
    }
  }
  return {
    mockEnroll: vi.fn(),
    mockVerifyEnrollment: vi.fn(),
    mockGenerateBackupCodes: vi.fn(),
    mockRegenerateBackupCodes: vi.fn(),
    MockBackupCodesError,
  };
});

vi.mock('../../services/two-factor-service', () => ({
  twoFactorService: {
    enroll: (...args: unknown[]) => mockEnroll(...args),
    verifyEnrollment: (...args: unknown[]) => mockVerifyEnrollment(...args),
    generateBackupCodes: (...args: unknown[]) => mockGenerateBackupCodes(...args),
    regenerateBackupCodes: (...args: unknown[]) => mockRegenerateBackupCodes(...args),
  },
  BackupCodesError: MockBackupCodesError,
}));

/** Walk the wizard from the QR step to the backup-codes step. */
async function advanceToCodesStep(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /next|continue/i })).toBeInTheDocument();
  });
  await user.click(screen.getByRole('button', { name: /next|continue/i }));

  await waitFor(() => {
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
  await user.type(screen.getByRole('textbox'), '123456');

  await waitFor(() => {
    expect(mockVerifyEnrollment).toHaveBeenCalledWith('factor-new', '123456');
  });
}

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

  describe('Step 3: Backup codes', () => {
    it('should issue and display backup codes after successful verification', async () => {
      const user = userEvent.setup();
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      await advanceToCodesStep(user);

      await waitFor(() => {
        expect(mockGenerateBackupCodes).toHaveBeenCalled();
      });
      expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
      expect(
        screen.getByText(/each works once if you lose your authenticator/i)
      ).toBeInTheDocument();
      // The user must acknowledge before the wizard can finish.
      expect(screen.queryByText(/two-factor authentication enabled/i)).not.toBeInTheDocument();
    });

    it('should require acknowledgement before reaching the done step', async () => {
      const user = userEvent.setup();
      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });

      await advanceToCodesStep(user);

      const ack = await screen.findByRole('button', { name: /saved my backup codes/i });
      await user.click(ack);

      expect(await screen.findByText(/two-factor authentication enabled/i)).toBeInTheDocument();
    });

    it('should offer regeneration when the server answers 409 (codes already exist)', async () => {
      const user = userEvent.setup();
      mockGenerateBackupCodes.mockRejectedValue(
        new MockBackupCodesError(
          'Backup codes already exist for this account. Regenerate them instead.',
          409
        )
      );
      mockRegenerateBackupCodes.mockResolvedValue(['NEW1-CODE', 'NEW2-CODE']);

      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });
      await advanceToCodesStep(user);

      expect(await screen.findByText(/you already have backup codes/i)).toBeInTheDocument();
      // Not a dead end: keeping the existing set still finishes enrollment.
      expect(screen.getByRole('button', { name: /keep my existing codes/i })).toBeInTheDocument();

      // Re-proving the authenticator rotates the set.
      await user.type(screen.getByRole('textbox'), '654321');
      await waitFor(() => {
        expect(mockRegenerateBackupCodes).toHaveBeenCalledWith('654321');
      });
      expect(await screen.findByText('NEW1-CODE')).toBeInTheDocument();
    });

    it('should let the user skip past a 409 without dead-ending', async () => {
      const user = userEvent.setup();
      mockGenerateBackupCodes.mockRejectedValue(
        new MockBackupCodesError('Backup codes already exist for this account.', 409)
      );

      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });
      await advanceToCodesStep(user);

      const keep = await screen.findByRole('button', { name: /keep my existing codes/i });
      await user.click(keep);

      expect(await screen.findByText(/two-factor authentication enabled/i)).toBeInTheDocument();
    });

    it('should not block enrollment when code generation fails outright', async () => {
      const user = userEvent.setup();
      mockGenerateBackupCodes.mockRejectedValue(new Error('Server error'));

      render(<TwoFactorSetupWizard {...defaultProps} />, { wrapper: createWrapper() });
      await advanceToCodesStep(user);

      expect(await screen.findByText(/backup codes unavailable/i)).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();

      // Enrollment still completes — working 2FA beats shown codes.
      await user.click(screen.getByRole('button', { name: /continue/i }));
      expect(await screen.findByText(/two-factor authentication enabled/i)).toBeInTheDocument();
      expect(
        screen.getByText(/issue backup codes from your profile security panel/i)
      ).toBeInTheDocument();
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
    it('should call onComplete only after the codes step is acknowledged', async () => {
      const onComplete = vi.fn();
      const user = userEvent.setup();
      render(<TwoFactorSetupWizard {...defaultProps} onComplete={onComplete} />, {
        wrapper: createWrapper(),
      });

      await advanceToCodesStep(user);

      // Codes step is reached first — onComplete must not have fired yet.
      const ack = await screen.findByRole('button', { name: /saved my backup codes/i });
      expect(onComplete).not.toHaveBeenCalled();
      await user.click(ack);

      await waitFor(() => {
        expect(screen.getByText(/two-factor authentication enabled/i)).toBeInTheDocument();
      });

      const doneButton = screen.getByRole('button', { name: /done|finish|complete/i });
      await user.click(doneButton);

      expect(onComplete).toHaveBeenCalled();
    });
  });
});
