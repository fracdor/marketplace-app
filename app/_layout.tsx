import '../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { AuthProvider } from '@/features/auth/AuthProvider';

// No custom defaultOptions: intentional for now. TanStack Query's defaults
// (3 retries with exponential backoff before a query reports isError) are
// acceptable for this MVP scope; tuning retry/staleTime/onlineManager is
// deferred (see the plan's "Notes for the executor").
const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
