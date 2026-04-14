import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TwoFactorVerifyInput } from './TwoFactorVerifyInput';

describe('TwoFactorVerifyInput', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    isLoading: false,
  };

  describe('rendering', () => {
    it('should render a text input with numeric inputMode', () => {
      render(<TwoFactorVerifyInput {...defaultProps} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('inputMode', 'numeric');
    });

    it('should have autocomplete set to one-time-code', () => {
      render(<TwoFactorVerifyInput {...defaultProps} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('autoComplete', 'one-time-code');
    });

    it('should have maxLength of 6', () => {
      render(<TwoFactorVerifyInput {...defaultProps} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('maxLength', '6');
    });

    it('should display placeholder text', () => {
      render(<TwoFactorVerifyInput {...defaultProps} />);
      const input = screen.getByPlaceholderText('000000');
      expect(input).toBeInTheDocument();
    });
  });

  describe('input behavior', () => {
    it('should only allow numeric characters', async () => {
      const user = userEvent.setup();
      render(<TwoFactorVerifyInput {...defaultProps} />);
      const input = screen.getByRole('textbox');

      await user.type(input, 'abc123def456');
      expect(input).toHaveValue('123456');
    });

    it('should auto-submit when 6 digits are entered', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<TwoFactorVerifyInput {...defaultProps} onSubmit={onSubmit} />);
      const input = screen.getByRole('textbox');

      await user.type(input, '123456');
      expect(onSubmit).toHaveBeenCalledWith('123456');
    });

    it('should not submit with fewer than 6 digits', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<TwoFactorVerifyInput {...defaultProps} onSubmit={onSubmit} />);
      const input = screen.getByRole('textbox');

      await user.type(input, '12345');
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('error display', () => {
    it('should display error message when provided', () => {
      render(<TwoFactorVerifyInput {...defaultProps} error="Invalid code" />);
      expect(screen.getByText('Invalid code')).toBeInTheDocument();
    });

    it('should not display error when not provided', () => {
      render(<TwoFactorVerifyInput {...defaultProps} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should disable input when loading', () => {
      render(<TwoFactorVerifyInput {...defaultProps} isLoading={true} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });
  });

  describe('paste handling', () => {
    it('should handle pasting a 6-digit code', () => {
      const onSubmit = vi.fn();
      render(<TwoFactorVerifyInput {...defaultProps} onSubmit={onSubmit} />);
      const input = screen.getByRole('textbox');

      fireEvent.paste(input, {
        clipboardData: { getData: () => '654321' },
      });

      expect(input).toHaveValue('654321');
      expect(onSubmit).toHaveBeenCalledWith('654321');
    });

    it('should strip non-numeric characters from pasted text', () => {
      const onSubmit = vi.fn();
      render(<TwoFactorVerifyInput {...defaultProps} onSubmit={onSubmit} />);
      const input = screen.getByRole('textbox');

      fireEvent.paste(input, {
        clipboardData: { getData: () => '12 34 56' },
      });

      expect(input).toHaveValue('123456');
      expect(onSubmit).toHaveBeenCalledWith('123456');
    });
  });
});
