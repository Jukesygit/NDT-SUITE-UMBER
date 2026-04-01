/**
 * Auth Password Reset Form - DOM-based legacy password reset modal.
 *
 * This creates an inline modal for password reset when the user
 * clicks a Supabase password recovery link.
 */

import supabase from '../supabase-client';

export function showPasswordResetForm(): void {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-center; z-index: 9999;';

    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.18); border-radius: 16px; padding: 40px; max-width: 400px; width: 90%;">
            <h2 style="color: #fff; font-size: 24px; font-weight: 700; margin-bottom: 8px;">Reset Your Password</h2>
            <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 24px;">Enter your new password below.</p>

            <form id="password-reset-form">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 500; margin-bottom: 8px;">New Password</label>
                    <input type="password" id="new-password" required minlength="6" style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box;">
                </div>

                <div style="margin-bottom: 24px;">
                    <label style="display: block; color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 500; margin-bottom: 8px;">Confirm Password</label>
                    <input type="password" id="confirm-password" required minlength="6" style="width: 100%; padding: 12px 16px; font-size: 14px; color: #fff; background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; outline: none; box-sizing: border-box;">
                </div>

                <div id="reset-error" style="display: none; color: #ff6b6b; font-size: 14px; margin-bottom: 16px;"></div>

                <div style="display: flex; gap: 12px;">
                    <button type="button" id="cancel-reset" style="flex: 1; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; cursor: pointer;">Cancel</button>
                    <button type="submit" style="flex: 1; padding: 12px; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(135deg, rgba(90,150,255,0.9), rgba(110,170,255,0.9)); border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 20px rgba(100,150,255,0.3);">Reset Password</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#password-reset-form') as HTMLFormElement;
    const newPasswordInput = modal.querySelector('#new-password') as HTMLInputElement;
    const confirmPasswordInput = modal.querySelector('#confirm-password') as HTMLInputElement;
    const errorDiv = modal.querySelector('#reset-error') as HTMLDivElement;
    const cancelBtn = modal.querySelector('#cancel-reset') as HTMLButtonElement;

    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
        window.location.reload();
    });

    form.addEventListener('submit', async (e: Event) => {
        e.preventDefault();

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'Passwords do not match';
            errorDiv.style.display = 'block';
            return;
        }

        if (newPassword.length < 6) {
            errorDiv.textContent = 'Password must be at least 6 characters';
            errorDiv.style.display = 'block';
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
            errorDiv.textContent = 'Error updating password: ' + error.message;
            errorDiv.style.display = 'block';
        } else {
            document.body.removeChild(modal);
            window.location.href = window.location.origin + '/#/';
        }
    });
}
