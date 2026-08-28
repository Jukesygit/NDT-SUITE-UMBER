/**
 * Tests for TwoFactorChallenge — the sign-in second-factor step, including the
 * "lost your authenticator" backup-code path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TwoFactorChallenge } from './TwoFactorChallenge';

const { mockVerifyBackupCode } = vi.hoisted(() => ({ mockVerifyBackupCode: vi.fn() }));

vi.mock('../../services/two-factor-service', () => ({
  twoFactorService: {
    verifyBackupCode: (...args: unknown[]) => mockVerifyBackupCode(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const defaultProps = {
  onSubmitCode: vi.fn(),
  isVerifying: false,
  verifyError: '',
  onBackupCodeAccepted: vi.fn(),
  onBackToSignIn: vi.fn(),
};

async function openBackupCodeForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /use a backup code/i }));
}

describe('TwoFactorChallenge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyBackupCode.mockResolvedValue({ remaining: 9 });
  });

  it('shows the authenticator input by default and submits the code', async () => {
    const user = userEvent.setup();
    const onSubmitCode = vi.fn();
    render(<TwoFactorChallenge {...defaultProps} onSubmitCode={onSubmitCode} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByRole('textbox'), '123456');

    expect(onSubmitCode).toHaveBeenCalledWith('123456');
    expect(mockVerifyBackupCode).not.toHaveBeenCalled();
  });

  it('offers the lost-authenticator entry point', () => {
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() });

    expect(
      screen.getByRole('button', { name: /lost your authenticator\? use a backup code/i })
    ).toBeInTheDocument();
  });

  it('warns that redeeming a backup code resets two-factor setup', async () => {
    const user = userEvent.setup();
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() });

    await openBackupCodeForm(user);

    expect(
      screen.getByText(/will sign you in and reset your two-factor setup/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/enrol a new authenticator/i)).toBeInTheDocument();
  });

  it('redeems the backup code and reports acceptance to the caller', async () => {
    const user = userEvent.setup();
    const onBackupCodeAccepted = vi.fn();
    render(<TwoFactorChallenge {...defaultProps} onBackupCodeAccepted={onBackupCodeAccepted} />, {
      wrapper: createWrapper(),
    });

    await openBackupCodeForm(user);
    await user.type(screen.getByLabelText(/backup code/i), 'ABCD-EFGH');
    await user.click(screen.getByRole('button', { name: /use backup code/i }));

    await waitFor(() => {
      expect(mockVerifyBackupCode).toHaveBeenCalledWith('ABCD-EFGH');
    });
    await waitFor(() => {
      expect(onBackupCodeAccepted).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces the server failure message verbatim', async () => {
    const user = userEvent.setup();
    mockVerifyBackupCode.mockRejectedValue(new Error('Invalid or used backup code'));
    const onBackupCodeAccepted = vi.fn();
    render(<TwoFactorChallenge {...defaultProps} onBackupCodeAccepted={onBackupCodeAccepted} />, {
      wrapper: createWrapper(),
    });

    await openBackupCodeForm(user);
    await user.type(screen.getByLabelText(/backup code/i), 'XXXX-YYYY');
    await user.click(screen.getByRole('button', { name: /use backup code/i }));

    expect(await screen.findByText('Invalid or used backup code')).toBeInTheDocument();
    expect(onBackupCodeAccepted).not.toHaveBeenCalled();
  });

  it('surfaces the rate-limit message verbatim', async () => {
    const user = userEvent.setup();
    mockVerifyBackupCode.mockRejectedValue(
      new Error('Too many attempts. Please wait and try again.')
    );
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() });

    await openBackupCodeForm(user);
    await user.type(screen.getByLabelText(/backup code/i), 'ABCD-EFGH');
    await user.click(screen.getByRole('button', { name: /use backup code/i }));

    expect(
      await screen.findByText('Too many attempts. Please wait and try again.')
    ).toBeInTheDocument();
  });

  it('can return to the authenticator input', async () => {
    const user = userEvent.setup();
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() });

    await openBackupCodeForm(user);
    expect(screen.getByLabelText(/backup code/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /use your authenticator instead/i }));

    expect(screen.queryByLabelText(/backup code/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls back to sign in', async () => {
    const user = userEvent.setup();
    const onBackToSignIn = vi.fn();
    render(<TwoFactorChallenge {...defaultProps} onBackToSignIn={onBackToSignIn} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /back to sign in/i }));

    expect(onBackToSignIn).toHaveBeenCalled();
  });
});
