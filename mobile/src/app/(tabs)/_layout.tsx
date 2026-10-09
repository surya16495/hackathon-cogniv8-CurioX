import { Tabs } from 'expo-router/js-tabs';
import { TabBar, type TabKey } from '@/components/TabBar';
import { useGround } from '@/ui/tokens';

export default function TabsLayout() {
  const g = useGround();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: g.ground } }}
      tabBar={({ state, navigation }) => (
        <TabBar current={state.routes[state.index]!.name as TabKey} onTab={(k) => navigation.navigate(k)} />
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="talk" />
      <Tabs.Screen name="pins" />
    </Tabs>
  );
}
