import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ProtectedRoute } from "../ProtectedRoute";

const mockUseAuth = vi.fn();

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderProtected(initialRoute: string, children: React.ReactNode = <div>Protected Content</div>): void {
  render(
    <ChakraProvider value={defaultSystem}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route
            path={initialRoute}
            element={<ProtectedRoute>{children}</ProtectedRoute>}
          />
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>
  );
}

describe("ProtectedRoute", () => {
  it("renders a spinner while loading", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    renderProtected("/dashboard");

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    renderProtected("/dashboard");

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderProtected("/dashboard");

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });
});
