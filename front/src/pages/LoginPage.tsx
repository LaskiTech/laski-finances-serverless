import { useState } from "react";
import type { FormEvent } from "react";
import {
  Box,
  Button,
  Field,
  Flex,
  Heading,
  Input,
  Link,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { validateEmail } from "../auth/validation";

function GoogleIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginPage(): React.JSX.Element {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState(
    (location.state as { error?: string } | null)?.error ?? "",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function handleGoogleSignIn(): Promise<void> {
    setServerError("");
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Could not start Google sign-in. Please try again.",
      );
      setIsGoogleLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setServerError("");

    const emailResult = validateEmail(email);
    const pwdMissing = !password;

    setEmailError(emailResult.errors[0] ?? "");
    setPasswordError(pwdMissing ? "Password is required" : "");

    if (!emailResult.valid || pwdMissing) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn(email, password);

      if (result.nextStep === "CONFIRM_SIGN_UP") {
        navigate(`/confirm-signup?email=${encodeURIComponent(email)}`);
        return;
      }

      const redirect = searchParams.get("redirect") || "/";
      navigate(redirect);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const anyLoading = isLoading || isGoogleLoading;

  return (
    <Box maxW="md" mx="auto" mt="12" p="6">
      <Heading as="h1" size="2xl" mb="6" textAlign="center">
        Sign In
      </Heading>

      {serverError && (
        <Box bg="red.100" color="red.800" p="3" borderRadius="md" mb="4" role="alert">
          {serverError}
        </Box>
      )}

      <Stack gap="4">
        <Button
          onClick={handleGoogleSignIn}
          loading={isGoogleLoading}
          disabled={anyLoading}
          variant="outline"
          width="full"
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <Flex align="center" gap="3">
          <Separator flex="1" />
          <Text color="gray.500" fontSize="sm" flexShrink={0}>or</Text>
          <Separator flex="1" />
        </Flex>

        <form onSubmit={handleSubmit}>
          <Stack gap="4">
            <Field.Root invalid={!!emailError}>
              <Field.Label>Email</Field.Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                placeholder="you@example.com"
              />
              {emailError && <Field.ErrorText>{emailError}</Field.ErrorText>}
            </Field.Root>

            <Field.Root invalid={!!passwordError}>
              <Field.Label>Password</Field.Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Enter your password"
              />
              {passwordError && <Field.ErrorText>{passwordError}</Field.ErrorText>}
            </Field.Root>

            <Button type="submit" colorPalette="blue" width="full" loading={isLoading} disabled={anyLoading}>
              Sign In
            </Button>
          </Stack>
        </form>
      </Stack>

      <Stack mt="4" gap="2" textAlign="center">
        <Text>
          <Link asChild>
            <RouterLink to="/forgot-password">Forgot password?</RouterLink>
          </Link>
        </Text>
        <Text>
          Don&apos;t have an account?{" "}
          <Link asChild>
            <RouterLink to="/signup">Sign up</RouterLink>
          </Link>
        </Text>
      </Stack>
    </Box>
  );
}
