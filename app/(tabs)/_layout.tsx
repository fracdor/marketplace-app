import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/features/auth/useAuth';

export default function TabsLayout() {
  const { loading, session } = useAuth();
  // Guard: (tabs) is only reachable with a session. Covers sign-out (the gate
  // in app/index.tsx is unmounted by then) and deep links that skip the gate.
  if (!loading && !session) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="my-tasks" options={{ title: 'Mis tareas' }} />
      <Tabs.Screen name="post-task" options={{ title: 'Publicar' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
