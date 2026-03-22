import { useState } from "react";
import type { FormEvent } from "react";
import {
  Box,
  Button,
  Field,
  Heading,
  Input,
  Link,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { validatePassword, validatePasswordMatch } from "../auth/validation";

export function ResetPasswordPage(): React.JSX.Element {
  const { confirmResetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codeError, setCodeError] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [confirmPasswordErrors, setConfirmPasswordErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!email) {
    return (
      <Box maxW="md" mx="auto" mt="12" p="6" textAlign="center">
        <Heading as="h1" size="2xl" mb="4">
          Missing Email
        </Heading>
        <Text mb="4">No email address was provided. Please request a password reset first.</Text>
        <Link asChild>
          <RouterLink to="/forgot-password">Go to Forgot Password</RouterLink>
        </Link>
      </Box>
    );
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setServerError("");

    const trimmedCode = code.trim();
    const codeInvalid = !trimmedCode;
    const passwordResult = validatePassword(newPassword);
    const matchResult = validatePasswordMatch(newPassword, confirmPassword);

    setCodeError(codeInvalid ? "Verification code is required" : "");
    setPasswordErrors(passwordResult.errors);
    setConfirmPasswordErrors(matchResult.errors);

    if (codeInvalid || !passwordResult.valid || !matchResult.valid) {
      return;
    }

    setIsLoading(true);
    try {
      await confirmResetPassword(email, trimmedCode, newPassword);
      navigate("/login?passwordReset=true");
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Box maxW="md" mx="auto" mt="12" p="6">
      <Heading as="h1" size="2xl" mb="2" textAlign="center">
        Reset Password
      </Heading>
      <Text mb="6" textAlign="center" color="fg.muted">
        Enter the verification code sent to {email} and your new password
      </Text>

      {serverError && (
        <Box bg="red.100" color="red.800" p="3" borderRadius="md" mb="4" role="alert">
          {serverError}
        </Box>
      )}

      <form onSubmit={handleSubmit}>
        <Stack gap="4">
          <Field.Root invalid={!!codeError}>
            <Field.Label>Verification Code</Field.Label>
            <Input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError("");
              }}
              placeholder="Enter 6-digit code"
              maxLength={6}
            />
            {codeError && <Field.ErrorText>{codeError}</Field.ErrorText>}
          </Field.Root>

          <Field.Root invalid={passwordErrors.length > 0}>
            <Field.Label>New Password</Field.Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordErrors([]);
              }}
              placeholder="Enter new password"
            />
            {passwordErrors.map((err) => (
              <Field.ErrorText key={err}>{err}</Field.ErrorText>
            ))}
          </Field.Root>

          <Field.Root invalid={confirmPasswordErrors.length > 0}>
            <Field.Label>Confirm Password</Field.Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmPasswordErrors([]);
              }}
              placeholder="Confirm new password"
            />
            {confirmPasswordErrors.map((err) => (
              <Field.ErrorText key={err}>{err}</Field.ErrorText>
            ))}
          </Field.Root>

          <Button
            type="submit"
            colorPalette="blue"
            width="full"
            loading={isLoading}
            disabled={isLoading}
          >
            Reset Password
          </Button>
        </Stack>
      </form>

      <Stack mt="4" gap="2" textAlign="center">
        <Text>
          <Link asChild>
            <RouterLink to="/login">Back to Sign In</RouterLink>
          </Link>
        </Text>
      </Stack>
    </Box>
  );
}
