import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Flex, Spinner, Text } from "@chakra-ui/react";
import { useAuth } from "../auth/useAuth";

export function AuthCallbackPage(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const handled = useRef(false);

  const error = searchParams.get("error");

  useEffect(() => {
    if (handled.current) return;

    if (error) {
      handled.current = true;
      if (error === "access_denied") {
        navigate("/login", { replace: true });
      } else {
        navigate("/login", {
          replace: true,
          state: { error: "Sign-in with Google failed. Please try again." },
        });
      }
      return;
    }

    if (!isLoading && isAuthenticated) {
      handled.current = true;
      const redirect = sessionStorage.getItem("authRedirect") || "/dashboard";
      sessionStorage.removeItem("authRedirect");
      navigate(redirect, { replace: true });
    } else if (!isLoading && !isAuthenticated) {
      handled.current = true;
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, error, navigate]);

  return (
    <Flex
      minH="100vh"
      direction="column"
      align="center"
      justify="center"
      bg="#FAFBFC"
    >
      <Box
        bg="white"
        borderRadius="14px"
        border="1px solid"
        borderColor="#E5E7EB"
        p="10"
        textAlign="center"
      >
        <Spinner color="#00D4AA" size="lg" mb="4" />
        <Text color="#6B7280" fontSize="sm">Completing sign-in...</Text>
      </Box>
    </Flex>
  );
}
