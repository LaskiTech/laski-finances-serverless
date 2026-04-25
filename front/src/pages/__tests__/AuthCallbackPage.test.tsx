import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { AuthCallbackPage } from '../AuthCallbackPage';

const mockUseAuth = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderCallback(route = '/auth/callback'): void {
  render(
    <ChakraProvider value={defaultSystem}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>,
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders spinner when loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    renderCallback();

    expect(screen.getByText('Concluindo login...')).toBeInTheDocument();
  });

  it('redirects to /login on access_denied error', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderCallback('/auth/callback?error=access_denied');

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('redirects to /login with error state on other errors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderCallback('/auth/callback?error=server_error');

    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      replace: true,
      state: { error: 'Login com Google falhou. Tente novamente.' },
    });
  });

  it('redirects to /dashboard when authenticated and no error', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    renderCallback();

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('redirects to stored path when authenticated', () => {
    sessionStorage.setItem('authRedirect', '/transactions');
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    renderCallback();

    expect(mockNavigate).toHaveBeenCalledWith('/transactions', { replace: true });
  });

  it('redirects to /login when not authenticated and not loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderCallback();

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
