import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Drawer,
  Flex,
  IconButton,
  Text,
} from "@chakra-ui/react";
import { useAuth } from "../auth/useAuth";

const NAV_LINKS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Transactions", path: "/transactions" },
] as const;

function LaskiLogoSmall(): React.JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#00D4AA" />
      <path d="M14 34V14h4v16h10v4H14z" fill="#0B1426" />
      <circle cx="36" cy="16" r="3" fill="#0B1426" opacity="0.4" />
    </svg>
  );
}

export function AppLayout(): React.JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavClick = (path: string): void => {
    setDrawerOpen(false);
    navigate(path);
  };

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate("/login");
  };

  return (
    <Box bg="#FAFBFC" minH="100vh">
      {/* Header bar */}
      <Flex
        as="header"
        position="fixed"
        top="0"
        left="0"
        right="0"
        height="60px"
        align="center"
        justify="space-between"
        px={5}
        bg="#0B1426"
        zIndex="banner"
      >
        <Flex align="center" gap="3">
          <IconButton
            aria-label="Open menu"
            variant="ghost"
            size="sm"
            color="whiteAlpha.800"
            _hover={{ bg: "whiteAlpha.100" }}
            onClick={() => setDrawerOpen(true)}
          >
            <HamburgerIcon />
          </IconButton>

          <Flex align="center" gap="2">
            <LaskiLogoSmall />
            <Text fontWeight="700" fontSize="md" color="white" letterSpacing="-0.02em">
              LASKI Finances
            </Text>
          </Flex>
        </Flex>

        <Button
          variant="outline"
          size="sm"
          color="whiteAlpha.800"
          borderColor="whiteAlpha.200"
          fontWeight="500"
          fontSize="xs"
          borderRadius="8px"
          _hover={{ bg: "whiteAlpha.100", borderColor: "whiteAlpha.300" }}
          onClick={() => void handleSignOut()}
        >
          Sign out
        </Button>
      </Flex>

      {/* Navigation drawer */}
      <Drawer.Root
        open={drawerOpen}
        onOpenChange={(details) => setDrawerOpen(details.open)}
        placement="start"
      >
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="#0B1426">
            <Drawer.Header borderBottomWidth="1px" borderColor="whiteAlpha.100">
              <Flex align="center" gap="2">
                <LaskiLogoSmall />
                <Drawer.Title color="white" fontWeight="700" letterSpacing="-0.02em">
                  Navigation
                </Drawer.Title>
              </Flex>
            </Drawer.Header>
            <Drawer.Body p={0}>
              <Flex direction="column" pt="2">
                {NAV_LINKS.map((link) => {
                  const isActive = link.path === '/transactions'
            ? location.pathname.startsWith('/transactions')
            : location.pathname === link.path;
                  return (
                    <Button
                      key={link.path}
                      variant="ghost"
                      justifyContent="flex-start"
                      borderRadius={0}
                      px={6}
                      py={6}
                      fontWeight={isActive ? "600" : "400"}
                      fontSize="sm"
                      bg={isActive ? "whiteAlpha.100" : "transparent"}
                      color={isActive ? "#00D4AA" : "whiteAlpha.700"}
                      borderLeft={isActive ? "3px solid" : "3px solid transparent"}
                      borderColor={isActive ? "#00D4AA" : "transparent"}
                      _hover={{ bg: "whiteAlpha.50", color: "white" }}
                      onClick={() => handleNavClick(link.path)}
                    >
                      {link.label}
                    </Button>
                  );
                })}
              </Flex>
            </Drawer.Body>
            <Drawer.CloseTrigger color="whiteAlpha.600" />
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>

      {/* Page content */}
      <Box pt="60px">
        <Outlet />
      </Box>
    </Box>
  );
}

function HamburgerIcon(): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
