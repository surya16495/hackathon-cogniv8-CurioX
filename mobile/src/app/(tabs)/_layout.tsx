import { Tabs } from 'expo-router/js-tabs';
import { TabBar, type TabKey } from '@/components/TabBar';
import { useGround } from '@/ui/tokens';

// Every page lives inside the tabs, so the bottom bar stays wherever the reader goes.
// Only Home, Talk and Pinboard are buttons; the rest are reached from those.
export default function TabsLayout() {
  const g = useGround();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: g.ground } }}
      tabBar={({ state, navigation }) => (
        <TabBar current={state.routes[state.index]!.name as TabKey} onTab={(k) => navigation.navigate(k)} />
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="talk" />
      <Tabs.Screen name="pins" />
      <Tabs.Screen name="ask" options={{ href: null }} />
      <Tabs.Screen name="quiz" options={{ href: null }} />
      <Tabs.Screen name="you" options={{ href: null }} />
      <Tabs.Screen name="deck/[id]" options={{ href: null }} />
    </Tabs>
  );
}
