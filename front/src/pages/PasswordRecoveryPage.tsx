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
import { validateEmail } from "../auth/validation";

export function PasswordRecoveryPage(): React.JSX.Element {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setServerError("");

    const emailResult = validateEmail(email);
    setEmailError(emailResult.errors[0] ?? "");

    if (!emailResult.valid) {
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(email);
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
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
        Forgot Password
      </Heading>
      <Text mb="6" textAlign="center" color="fg.muted">
        Enter your email address and we&apos;ll send you a verification code
      </Text>

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

          <Button
            type="submit"
            colorPalette="blue"
            width="full"
            loading={isLoading}
            disabled={isLoading}
          >
            Send Reset Code
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
