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

function LaskiLogo(): React.JSX.Element {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#00D4AA" />
      <path
        d="M14 34V14h4v16h10v4H14z"
        fill="#0B1426"
      />
      <circle cx="36" cy="16" r="3" fill="#0B1426" opacity="0.4" />
    </svg>
  );
}

function HeroPattern(): React.JSX.Element {
  return (
    <Box
      position="absolute"
      inset="0"
      overflow="hidden"
      pointerEvents="none"
      opacity="0.07"
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#00D4AA" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <circle cx="80%" cy="20%" r="120" fill="#00D4AA" opacity="0.3" />
        <circle cx="20%" cy="80%" r="80" fill="#00D4AA" opacity="0.2" />
      </svg>
    </Box>
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
    <Flex minH="100vh">
      {/* Hero Panel */}
      <Box
        display={{ base: "none", lg: "flex" }}
        w="45%"
        bg="#0B1426"
        position="relative"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        p="16"
        overflow="hidden"
      >
        <HeroPattern />

        <Box position="relative" zIndex="1" textAlign="center" maxW="400px">
          <Flex justify="center" mb="8">
            <LaskiLogo />
          </Flex>

          <Heading
            as="h2"
            fontSize="3xl"
            fontWeight="700"
            color="white"
            letterSpacing="-0.02em"
            lineHeight="1.2"
            mb="4"
          >
            Take control of your finances
          </Heading>

          <Text
            color="whiteAlpha.700"
            fontSize="md"
            lineHeight="1.7"
            mb="10"
          >
            Track expenses, monitor income, and gain insights into your financial health — all in one place.
          </Text>

          <Flex gap="8" justify="center">
            {[
              { value: "Real-time", label: "Tracking" },
              { value: "Smart", label: "Insights" },
              { value: "Secure", label: "Platform" },
            ].map((item) => (
              <Box key={item.label} textAlign="center">
                <Text color="#00D4AA" fontSize="lg" fontWeight="700">
                  {item.value}
                </Text>
                <Text color="whiteAlpha.500" fontSize="xs" textTransform="uppercase" letterSpacing="0.1em">
                  {item.label}
                </Text>
              </Box>
            ))}
          </Flex>
        </Box>

        {/* Bottom accent line */}
        <Box
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          h="3px"
          bgGradient="to-r"
          gradientFrom="#00D4AA"
          gradientTo="transparent"
        />
      </Box>

      {/* Form Panel */}
      <Flex
        flex="1"
        direction="column"
        justify="center"
        align="center"
        bg="#FAFBFC"
        px={{ base: "6", md: "16" }}
        py="12"
        position="relative"
      >
        {/* Subtle top-right accent */}
        <Box
          position="absolute"
          top="0"
          right="0"
          w="200px"
          h="200px"
          bg="radial-gradient(circle at top right, rgba(0, 212, 170, 0.06), transparent 70%)"
          pointerEvents="none"
        />

        <Box w="full" maxW="420px" position="relative">
          {/* Mobile logo */}
          <Flex
            display={{ base: "flex", lg: "none" }}
            justify="center"
            mb="6"
          >
            <Flex align="center" gap="3">
              <LaskiLogo />
              <Heading
                as="span"
                fontSize="xl"
                fontWeight="700"
                color="#0B1426"
                letterSpacing="-0.02em"
              >
                LASKI Finances
              </Heading>
            </Flex>
          </Flex>

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

          <Stack gap="5">
            <form onSubmit={handleSubmit}>
              <Stack gap="4">
                <Field.Root invalid={!!emailError}>
                  <Field.Label
                    fontSize="sm"
                    fontWeight="500"
                    color="#374151"
                    mb="1"
                  >
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

                <Field.Root invalid={!!passwordError}>
                  <Flex justify="space-between" align="center" mb="1" w="full">
                    <Field.Label
                      fontSize="sm"
                      fontWeight="500"
                      color="#374151"
                      mb="0"
                    >
                      Password
                    </Field.Label>
                    <Link
                      asChild
                      fontSize="xs"
                      color="#00D4AA"
                      fontWeight="500"
                      _hover={{ color: "#00B894" }}
                    >
                      <RouterLink to="/forgot-password">Forgot password?</RouterLink>
                    </Link>
                  </Flex>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError("");
                    }}
                    placeholder="Enter your password"
                    h="48px"
                    borderRadius="10px"
                    borderColor="#E5E7EB"
                    bg="white"
                    fontSize="sm"
                    _hover={{ borderColor: "#D1D5DB" }}
                    _focus={{ borderColor: "#00D4AA", boxShadow: "0 0 0 3px rgba(0, 212, 170, 0.1)" }}
                    transition="all 0.2s"
                  />
                  {passwordError && <Field.ErrorText fontSize="xs">{passwordError}</Field.ErrorText>}
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
                  disabled={anyLoading}
                  _hover={{ bg: "#162038" }}
                  transition="all 0.2s"
                >
                  Sign In
                </Button>
              </Stack>
            </form>

            <Flex align="center" gap="4">
              <Separator flex="1" borderColor="#E5E7EB" />
              <Text color="#9CA3AF" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em" flexShrink={0}>
                or
              </Text>
              <Separator flex="1" borderColor="#E5E7EB" />
            </Flex>

            <Button
              onClick={handleGoogleSignIn}
              loading={isGoogleLoading}
              disabled={anyLoading}
              variant="outline"
              width="full"
              h="48px"
              borderRadius="10px"
              borderColor="#E5E7EB"
              bg="white"
              color="#374151"
              fontWeight="500"
              fontSize="sm"
              _hover={{ bg: "#F9FAFB", borderColor: "#D1D5DB" }}
              transition="all 0.2s"
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          </Stack>

          <Text mt="8" textAlign="center" color="#6B7280" fontSize="sm">
            Don&apos;t have an account?{" "}
            <Link
              asChild
              color="#00D4AA"
              fontWeight="600"
              _hover={{ color: "#00B894" }}
            >
              <RouterLink to="/signup">Sign up</RouterLink>
            </Link>
          </Text>
        </Box>

        {/* Footer */}
        <Text
          position="absolute"
          bottom="6"
          color="#D1D5DB"
          fontSize="xs"
        >
          &copy; {new Date().getFullYear()} LASKI Finances
        </Text>
      </Flex>
    </Flex>
  );
}
