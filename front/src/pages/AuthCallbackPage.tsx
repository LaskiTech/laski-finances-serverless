import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Spinner, Text } from "@chakra-ui/react";
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
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minH="100vh">
      <Spinner size="xl" />
      <Text mt="4" color="gray.500">Completing sign-in...</Text>
    </Box>
  );
}
