// Powered by OnSpace.AI
import { Tabs, useRouter, usePathname } from 'expo-router';
import { View } from 'react-native';
import { CustomTabBar, TabName } from '../../components/feature/Custom TabBar';
import { Colors } from '../../constants/theme';

export default function TabLayout() {
  const router = useRouter();
  // Derive the highlighted tab from the actual route instead of local state:
  // screens can land back on the tab group without a tab press (e.g. saving
  // a habit uses router.replace), and local state would then highlight the
  // wrong tab.
  const pathname = usePathname() || '';
  const activeTab: TabName = pathname.includes('/statistics')
    ? 'statistics'
    : pathname.includes('/roadmap')
      ? 'roadmap'
      : pathname.includes('/hq')
        ? 'hq'
        : 'index';

  const handleTabPress = (tab: TabName) => {
    // `navigate` re-uses the existing tab screen instead of stacking a
    // duplicate on top, so Android's hardware back button exits the app
    // cleanly instead of cycling through every previously visited tab.
    router.navigate(`/(tabs)/${tab === 'index' ? '' : tab}` as any);
  };

  const handleAddPress = () => {
    router.push('/add-habit');
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={() => (
          <CustomTabBar
            activeTab={activeTab}
            onTabPress={handleTabPress}
            onAddPress={handleAddPress}
          />
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="hq" />
        <Tabs.Screen name="roadmap" />
        <Tabs.Screen name="statistics" />
      </Tabs>
    </View>
  );
}
