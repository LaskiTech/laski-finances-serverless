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
  Stack,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

function LaskiLogo(): React.JSX.Element {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#00D4AA" />
      <path d="M14 34V14h4v16h10v4H14z" fill="#0B1426" />
      <circle cx="36" cy="16" r="3" fill="#0B1426" opacity="0.4" />
    </svg>
  );
}

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
      <Flex
        minH="100vh"
        direction="column"
        justify="center"
        align="center"
        bg="#FAFBFC"
        px="6"
      >
        <Box textAlign="center" maxW="420px">
          <Flex justify="center" mb="6">
            <LaskiLogo />
          </Flex>
          <Heading as="h1" fontSize="2xl" fontWeight="700" color="#0B1426" mb="4">
            Missing Email
          </Heading>
          <Text color="#6B7280" fontSize="sm" mb="6">
            No email address was provided. Please sign up first.
          </Text>
          <Link
            asChild
            color="#00D4AA"
            fontWeight="600"
            _hover={{ color: "#00B894" }}
          >
            <RouterLink to="/signup">Go to Sign Up</RouterLink>
          </Link>
        </Box>
      </Flex>
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
    <Flex
      minH="100vh"
      direction="column"
      justify="center"
      align="center"
      bg="#FAFBFC"
      px={{ base: "6", md: "16" }}
      py="12"
      position="relative"
    >
      <Box
        position="absolute"
        top="0"
        right="0"
        w="200px"
        h="200px"
        bg="radial-gradient(circle at top right, rgba(0, 212, 170, 0.06), transparent 70%)"
        pointerEvents="none"
      />

      <Box w="full" maxW="420px">
        <Flex justify="center" mb="8">
          <LaskiLogo />
        </Flex>

        <Heading
          as="h1"
          fontSize="2xl"
          fontWeight="700"
          color="#0B1426"
          letterSpacing="-0.02em"
          mb="2"
          textAlign="center"
        >
          Verify Your Email
        </Heading>
        <Text color="#6B7280" fontSize="sm" textAlign="center" mb="8">
          We sent a verification code to {email}
        </Text>

        {serverError && (
          <Box
            bg="#FEF2F2"
            color="#DC2626"
            border="1px solid"
            borderColor="#FECACA"
            p="3"
            borderRadius="10px"
            mb="5"
            fontSize="sm"
            role="alert"
          >
            {serverError}
          </Box>
        )}

        {resendMessage && (
          <Box
            bg="#F0FDF4"
            color="#16A34A"
            border="1px solid"
            borderColor="#BBF7D0"
            p="3"
            borderRadius="10px"
            mb="5"
            fontSize="sm"
            role="status"
          >
            {resendMessage}
          </Box>
        )}

        <form onSubmit={handleSubmit}>
          <Stack gap="4">
            <Field.Root invalid={!!codeError}>
              <Field.Label fontSize="sm" fontWeight="500" color="#374151" mb="1">
                Verification Code
              </Field.Label>
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
                h="48px"
                borderRadius="10px"
                borderColor="#E5E7EB"
                bg="white"
                fontSize="sm"
                letterSpacing="0.2em"
                textAlign="center"
                _hover={{ borderColor: "#D1D5DB" }}
                _focus={{ borderColor: "#00D4AA", boxShadow: "0 0 0 3px rgba(0, 212, 170, 0.1)" }}
                transition="all 0.2s"
              />
              {codeError && <Field.ErrorText fontSize="xs">{codeError}</Field.ErrorText>}
            </Field.Root>

            <Button
              type="submit"
              width="full"
              h="48px"
              bg="#0B1426"
              color="white"
              fontWeight="600"
              fontSize="sm"
              borderRadius="10px"
              loading={isLoading}
              disabled={isLoading}
              _hover={{ bg: "#162038" }}
              transition="all 0.2s"
            >
              Verify
            </Button>
          </Stack>
        </form>

        <Stack mt="6" gap="3" textAlign="center">
          <Text color="#6B7280" fontSize="sm">
            Didn&apos;t receive a code?{" "}
            <Button
              variant="plain"
              size="sm"
              color="#00D4AA"
              fontWeight="600"
              onClick={handleResendCode}
              loading={isResending}
              disabled={isResending}
              _hover={{ color: "#00B894" }}
            >
              Resend code
            </Button>
          </Text>
          <Text fontSize="sm">
            <Link
              asChild
              color="#00D4AA"
              fontWeight="600"
              _hover={{ color: "#00B894" }}
            >
              <RouterLink to="/login">Back to Sign In</RouterLink>
            </Link>
          </Text>
        </Stack>
      </Box>

      <Text
        position="absolute"
        bottom="6"
        color="#D1D5DB"
        fontSize="xs"
      >
        &copy; {new Date().getFullYear()} LASKI Finances
      </Text>
    </Flex>
  );
}
