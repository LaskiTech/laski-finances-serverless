import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { App } from "./App";

vi.mock("./auth/auth-service", () => ({
  cognitoGetCurrentUser: vi.fn().mockRejectedValue(new Error("No user")),
  cognitoFetchSession: vi.fn().mockRejectedValue(new Error("No session")),
  cognitoSignIn: vi.fn(),
  cognitoSignUp: vi.fn(),
  cognitoConfirmSignUp: vi.fn(),
  cognitoResetPassword: vi.fn(),
  cognitoConfirmResetPassword: vi.fn(),
  cognitoSignOut: vi.fn(),
  cognitoResendSignUpCode: vi.fn(),
}));

describe("App", () => {
  it("renders the app and redirects unauthenticated user to login", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign In" })).toBeInTheDocument();
  });
});
