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
import { validateEmail } from "../auth/validation";

export function LoginPage(): React.JSX.Element {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

          <Button type="submit" colorPalette="blue" width="full" loading={isLoading} disabled={isLoading}>
            Sign In
          </Button>
        </Stack>
      </form>

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
