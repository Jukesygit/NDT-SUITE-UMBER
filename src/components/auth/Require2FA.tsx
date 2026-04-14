import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function Require2FA() {
  const auth = useAuth();

  // If 2FA is required but not verified, redirect to login
  if (auth.twoFactorRequired) {
    return <Navigate to="/login" replace />;
  }

  // Otherwise render child routes
  return <Outlet />;
}
