import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';

interface RenderWithProvidersOptions extends RenderOptions {
  routerProps?: MemoryRouterProps;
  withAuth?: boolean;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {}
) {
  const { routerProps = {}, withAuth = true, ...renderOptions } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    const wrapped = <MemoryRouter {...routerProps}>{children}</MemoryRouter>;

    if (withAuth) {
      return <AuthProvider>{wrapped}</AuthProvider>;
    }

    return wrapped;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

export default renderWithProviders;
