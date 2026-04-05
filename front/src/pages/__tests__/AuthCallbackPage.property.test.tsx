import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
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
        </Routes>
      </MemoryRouter>
    </ChakraProvider>,
  );
}

describe('AuthCallbackPage property tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  // Feature: federated-auth, Property 10: Callback page redirects on authentication
  it('Property 10: navigates away from /auth/callback when isAuthenticated becomes true', () => {
    fc.assert(
      fc.property(fc.boolean(), (hasStoredPath) => {
        vi.clearAllMocks();
        sessionStorage.clear();
        if (hasStoredPath) {
          sessionStorage.setItem('authRedirect', '/dashboard');
        }

        mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
        renderCallback();

        expect(mockNavigate).toHaveBeenCalled();
        const [navigatedPath] = mockNavigate.mock.calls[0];
        expect(navigatedPath).not.toBe('/auth/callback');
      }),
      { numRuns: 100 },
    );
  });

  // Feature: federated-auth, Property 11: Error param on callback triggers redirect to login
  it('Property 11: any non-empty error param navigates to /login without auth', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !s.includes('&') && !s.includes('=')),
        (errorValue) => {
          vi.clearAllMocks();
          mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
          renderCallback(`/auth/callback?error=${encodeURIComponent(errorValue)}`);

          expect(mockNavigate).toHaveBeenCalled();
          const [navigatedPath] = mockNavigate.mock.calls[0];
          expect(navigatedPath).toBe('/login');
        },
      ),
      { numRuns: 100 },
    );
  });
});
