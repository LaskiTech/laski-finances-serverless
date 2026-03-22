import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validatePassword,
  validatePasswordMatch,
  validateSignInForm,
  validateSignUpForm,
} from "../validation";

describe("validateEmail", () => {
  it("returns valid for a well-formed email", () => {
    const result = validateEmail("user@example.com");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error for empty string", () => {
    const result = validateEmail("");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email is required");
  });

  it("returns error for whitespace-only string", () => {
    const result = validateEmail("   ");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email is required");
  });

  it("returns error for missing @", () => {
    const result = validateEmail("userexample.com");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email format is invalid");
  });

  it("returns error for missing domain", () => {
    const result = validateEmail("user@");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email format is invalid");
  });

  it("returns error for missing local part", () => {
    const result = validateEmail("@example.com");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email format is invalid");
  });
});

describe("validatePassword", () => {
  it("returns valid for a compliant password", () => {
    const result = validatePassword("Abcdef1!");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error for password shorter than 8 chars", () => {
    const result = validatePassword("Ab1!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must be at least 8 characters");
  });

  it("returns error for missing uppercase", () => {
    const result = validatePassword("abcdefg1!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Password must contain at least one uppercase letter"
    );
  });

  it("returns error for missing lowercase", () => {
    const result = validatePassword("ABCDEFG1!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Password must contain at least one lowercase letter"
    );
  });

  it("returns error for missing digit", () => {
    const result = validatePassword("Abcdefgh!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Password must contain at least one digit"
    );
  });

  it("returns error for missing symbol", () => {
    const result = validatePassword("Abcdefg1");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Password must contain at least one symbol"
    );
  });

  it("returns multiple errors for multiple violations", () => {
    const result = validatePassword("abc");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("returns valid for exactly 8 chars meeting all rules", () => {
    const result = validatePassword("Aa1!xxxx");
    expect(result.valid).toBe(true);
  });
});

describe("validatePasswordMatch", () => {
  it("returns valid when passwords match", () => {
    const result = validatePasswordMatch("Password1!", "Password1!");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error when passwords differ", () => {
    const result = validatePasswordMatch("Password1!", "Password2!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Passwords do not match");
  });

  it("returns valid for two empty strings (match)", () => {
    const result = validatePasswordMatch("", "");
    expect(result.valid).toBe(true);
  });
});

describe("validateSignInForm", () => {
  it("returns valid for valid email and non-empty password", () => {
    const result = validateSignInForm("user@example.com", "anything");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns email error for empty email", () => {
    const result = validateSignInForm("", "password");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email is required");
  });

  it("returns password error for empty password", () => {
    const result = validateSignInForm("user@example.com", "");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password is required");
  });

  it("returns both errors for empty email and password", () => {
    const result = validateSignInForm("", "");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email is required");
    expect(result.errors).toContain("Password is required");
  });

  it("does NOT enforce password policy on sign-in", () => {
    const result = validateSignInForm("user@example.com", "weak");
    expect(result.valid).toBe(true);
  });
});

describe("validateSignUpForm", () => {
  it("returns valid for valid email, strong password, and matching confirm", () => {
    const result = validateSignUpForm(
      "user@example.com",
      "StrongP1!",
      "StrongP1!"
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns email error for invalid email", () => {
    const result = validateSignUpForm("bad", "StrongP1!", "StrongP1!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email format is invalid");
  });

  it("returns password policy errors for weak password", () => {
    const result = validateSignUpForm("user@example.com", "weak", "weak");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must be at least 8 characters");
  });

  it("returns mismatch error when passwords differ", () => {
    const result = validateSignUpForm(
      "user@example.com",
      "StrongP1!",
      "StrongP2!"
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Passwords do not match");
  });

  it("returns all errors for completely invalid input", () => {
    const result = validateSignUpForm("", "x", "y");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
