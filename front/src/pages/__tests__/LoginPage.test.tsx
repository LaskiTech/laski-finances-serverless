import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { LoginPage } from '../LoginPage';

const mockSignIn = vi.fn();
const mockSignInWithGoogle = vi.fn();

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signInWithGoogle: mockSignInWithGoogle,
    isAuthenticated: false,
    isLoading: false,
    user: null,
  }),
}));

function renderLoginPage(route = '/login'): void {
  render(
    <ChakraProvider value={defaultSystem}>
      <MemoryRouter initialEntries={[route]}>
        <LoginPage />
      </MemoryRouter>
    </ChakraProvider>,
  );
}

describe('LoginPage — Google sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Continue with Google" button', () => {
    renderLoginPage();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('renders "or" divider', () => {
    renderLoginPage();
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('calls signInWithGoogle when Google button is clicked', async () => {
    mockSignInWithGoogle.mockResolvedValueOnce(undefined);
    renderLoginPage();

    const button = screen.getByText('Continue with Google');
    await userEvent.click(button);

    expect(mockSignInWithGoogle).toHaveBeenCalledOnce();
  });

  it('shows error when signInWithGoogle throws', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(new Error('Could not start Google sign-in. Please try again.'));
    renderLoginPage();

    const button = screen.getByText('Continue with Google');
    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not start Google sign-in. Please try again.');
  });

  it('still renders the email/password form', () => {
    renderLoginPage();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows error passed via navigation state', () => {
    render(
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { error: 'Sign-in with Google failed. Please try again.' } }]}>
          <LoginPage />
        </MemoryRouter>
      </ChakraProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in with Google failed. Please try again.');
  });
});
