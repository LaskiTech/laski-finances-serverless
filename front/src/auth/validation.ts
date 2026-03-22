export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];

  if (!email.trim()) {
    errors.push("Email is required");
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push("Email format is invalid");
  }

  return { valid: errors.length === 0, errors };
}

export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one digit");
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Password must contain at least one symbol");
  }

  return { valid: errors.length === 0, errors };
}

export function validatePasswordMatch(
  password: string,
  confirmPassword: string
): ValidationResult {
  const errors: string[] = [];

  if (password !== confirmPassword) {
    errors.push("Passwords do not match");
  }

  return { valid: errors.length === 0, errors };
}

export function validateSignInForm(
  email: string,
  password: string
): ValidationResult {
  const errors: string[] = [];

  const emailResult = validateEmail(email);
  errors.push(...emailResult.errors);

  if (!password) {
    errors.push("Password is required");
  }

  return { valid: errors.length === 0, errors };
}

export function validateSignUpForm(
  email: string,
  password: string,
  confirmPassword: string
): ValidationResult {
  const errors: string[] = [];

  const emailResult = validateEmail(email);
  errors.push(...emailResult.errors);

  const passwordResult = validatePassword(password);
  errors.push(...passwordResult.errors);

  const matchResult = validatePasswordMatch(password, confirmPassword);
  errors.push(...matchResult.errors);

  return { valid: errors.length === 0, errors };
}
