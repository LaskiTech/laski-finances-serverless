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
    <Box>
      {/* Header bar */}
      <Flex
        as="header"
        position="fixed"
        top="0"
        left="0"
        right="0"
        height="56px"
        align="center"
        justify="space-between"
        px={4}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.200"
        zIndex="banner"
      >
        <IconButton
          aria-label="Open menu"
          variant="ghost"
          size="md"
          onClick={() => setDrawerOpen(true)}
        >
          <HamburgerIcon />
        </IconButton>

        <Text fontWeight="bold" fontSize="lg">
          LASKI Finances
        </Text>

        <Button
          variant="outline"
          size="sm"
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
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>Navigation</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body p={0}>
              <Flex direction="column">
                {NAV_LINKS.map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <Button
                      key={link.path}
                      variant="ghost"
                      justifyContent="flex-start"
                      borderRadius={0}
                      px={6}
                      py={6}
                      fontWeight={isActive ? "bold" : "normal"}
                      bg={isActive ? "blue.50" : "transparent"}
                      color={isActive ? "blue.600" : "inherit"}
                      onClick={() => handleNavClick(link.path)}
                    >
                      {link.label}
                    </Button>
                  );
                })}
              </Flex>
            </Drawer.Body>
            <Drawer.CloseTrigger />
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>

      {/* Page content */}
      <Box pt="56px">
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
