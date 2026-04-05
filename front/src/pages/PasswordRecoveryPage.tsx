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
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { validateEmail } from "../auth/validation";

function LaskiLogo(): React.JSX.Element {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#00D4AA" />
      <path d="M14 34V14h4v16h10v4H14z" fill="#0B1426" />
      <circle cx="36" cy="16" r="3" fill="#0B1426" opacity="0.4" />
    </svg>
  );
}

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
          Forgot Password
        </Heading>
        <Text color="#6B7280" fontSize="sm" textAlign="center" mb="8">
          Enter your email and we&apos;ll send you a verification code
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

        <form onSubmit={handleSubmit}>
          <Stack gap="4">
            <Field.Root invalid={!!emailError}>
              <Field.Label fontSize="sm" fontWeight="500" color="#374151" mb="1">
                Email
              </Field.Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                placeholder="you@example.com"
                h="48px"
                borderRadius="10px"
                borderColor="#E5E7EB"
                bg="white"
                fontSize="sm"
                _hover={{ borderColor: "#D1D5DB" }}
                _focus={{ borderColor: "#00D4AA", boxShadow: "0 0 0 3px rgba(0, 212, 170, 0.1)" }}
                transition="all 0.2s"
              />
              {emailError && <Field.ErrorText fontSize="xs">{emailError}</Field.ErrorText>}
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
              Send Reset Code
            </Button>
          </Stack>
        </form>

        <Text mt="8" textAlign="center" fontSize="sm">
          <Link
            asChild
            color="#00D4AA"
            fontWeight="600"
            _hover={{ color: "#00B894" }}
          >
            <RouterLink to="/login">Back to Sign In</RouterLink>
          </Link>
        </Text>
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
