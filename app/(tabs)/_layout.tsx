// Powered by OnSpace.AI
import { Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CustomTabBar, TabName } from '../../components/feature/Custom TabBar';
import { Colors } from '../../constants/theme';

export default function TabLayout() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabName>('index');

  const handleTabPress = (tab: TabName) => {
    setActiveTab(tab);
    router.push(`/(tabs)/${tab === 'index' ? '' : tab}` as any);
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
        <Tabs.Screen name="index" listeners={{ focus: () => setActiveTab('index') }} />
        <Tabs.Screen name="habits" listeners={{ focus: () => setActiveTab('habits') }} />
        <Tabs.Screen name="tasks" listeners={{ focus: () => setActiveTab('tasks') }} />
        <Tabs.Screen name="statistics" listeners={{ focus: () => setActiveTab('statistics') }} />
      </Tabs>
    </View>
  );
}
