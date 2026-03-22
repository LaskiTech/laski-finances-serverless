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

export function ConfirmSignUpPage(): React.JSX.Element {
  const { confirmSignUp, resendSignUpCode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [serverError, setServerError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  if (!email) {
    return (
      <Box maxW="md" mx="auto" mt="12" p="6" textAlign="center">
        <Heading as="h1" size="2xl" mb="4">
          Missing Email
        </Heading>
        <Text mb="4">No email address was provided. Please sign up first.</Text>
        <Link asChild>
          <RouterLink to="/signup">Go to Sign Up</RouterLink>
        </Link>
      </Box>
    );
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setServerError("");
    setResendMessage("");

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setCodeError("Verification code is required");
      return;
    }
    setCodeError("");

    setIsLoading(true);
    try {
      await confirmSignUp(email, trimmedCode);
      navigate("/login");
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

  async function handleResendCode(): Promise<void> {
    setServerError("");
    setResendMessage("");
    setIsResending(true);
    try {
      await resendSignUpCode(email);
      setResendMessage("A new verification code has been sent to your email.");
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Box maxW="md" mx="auto" mt="12" p="6">
      <Heading as="h1" size="2xl" mb="2" textAlign="center">
        Verify Your Email
      </Heading>
      <Text mb="6" textAlign="center" color="fg.muted">
        We sent a verification code to {email}
      </Text>

      {serverError && (
        <Box bg="red.100" color="red.800" p="3" borderRadius="md" mb="4" role="alert">
          {serverError}
        </Box>
      )}

      {resendMessage && (
        <Box bg="green.100" color="green.800" p="3" borderRadius="md" mb="4" role="status">
          {resendMessage}
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

          <Button
            type="submit"
            colorPalette="blue"
            width="full"
            loading={isLoading}
            disabled={isLoading}
          >
            Verify
          </Button>
        </Stack>
      </form>

      <Stack mt="4" gap="2" textAlign="center">
        <Text>
          Didn&apos;t receive a code?{" "}
          <Button
            variant="plain"
            colorPalette="blue"
            size="sm"
            onClick={handleResendCode}
            loading={isResending}
            disabled={isResending}
          >
            Resend code
          </Button>
        </Text>
        <Text>
          <Link asChild>
            <RouterLink to="/login">Back to Sign In</RouterLink>
          </Link>
        </Text>
      </Stack>
    </Box>
  );
}
