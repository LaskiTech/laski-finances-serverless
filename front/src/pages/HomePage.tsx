import { Box, Button, Heading, Text } from "@chakra-ui/react";
import { useAuth } from "../auth/useAuth";

export function HomePage(): React.JSX.Element {
  const { user, signOut } = useAuth();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
  };

  return (
    <Box p={8}>
      <Heading as="h1" mb={4}>LASKI Finances</Heading>
      {user?.email && <Text mb={4}>Welcome, {user.email}</Text>}
      <Button onClick={handleSignOut}>Sign Out</Button>
    </Box>
  );
}
