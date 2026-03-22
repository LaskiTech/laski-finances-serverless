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
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import {
  validateEmail,
  validatePassword,
  validatePasswordMatch,
} from "../auth/validation";

export function SignUpPage(): React.JSX.Element {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailErrors, setEmailErrors] = useState<string[]>([]);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [confirmPasswordErrors, setConfirmPasswordErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setServerError("");

    const emailResult = validateEmail(email);
    const passwordResult = validatePassword(password);
    const matchResult = validatePasswordMatch(password, confirmPassword);

    setEmailErrors(emailResult.errors);
    setPasswordErrors(passwordResult.errors);
    setConfirmPasswordErrors(matchResult.errors);

    if (!emailResult.valid || !passwordResult.valid || !matchResult.valid) {
      return;
    }

    setIsLoading(true);
    try {
      await signUp(email, password);
      navigate(`/confirm-signup?email=${encodeURIComponent(email)}`);
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
      <Heading as="h1" size="2xl" mb="6" textAlign="center">
        Sign Up
      </Heading>

      {serverError && (
        <Box bg="red.100" color="red.800" p="3" borderRadius="md" mb="4" role="alert">
          {serverError}
        </Box>
      )}

      <form onSubmit={handleSubmit}>
        <Stack gap="4">
          <Field.Root invalid={emailErrors.length > 0}>
            <Field.Label>Email</Field.Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailErrors([]);
              }}
              placeholder="you@example.com"
            />
            {emailErrors.map((err) => (
              <Field.ErrorText key={err}>{err}</Field.ErrorText>
            ))}
          </Field.Root>

          <Field.Root invalid={passwordErrors.length > 0}>
            <Field.Label>Password</Field.Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordErrors([]);
              }}
              placeholder="Create a password"
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
              placeholder="Confirm your password"
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
            Sign Up
          </Button>
        </Stack>
      </form>

      <Text mt="4" textAlign="center">
        Already have an account?{" "}
        <Link asChild>
          <RouterLink to="/login">Sign in</RouterLink>
        </Link>
      </Text>
    </Box>
  );
}
