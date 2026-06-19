import { Ionicons } from "@expo/vector-icons";
import { Drawer } from "expo-router/drawer";
import { useThemeColor } from "heroui-native";
import { useCallback } from "react";
import { Text } from "react-native";

import { ThemeToggle } from "@/components/theme-toggle";

type IoniconName = keyof typeof Ionicons.glyphMap;

function DrawerLayout() {
	const themeColorForeground = useThemeColor("foreground");
	const themeColorBackground = useThemeColor("background");

	const renderThemeToggle = useCallback(() => <ThemeToggle />, []);

	const screen = (name: string, title: string, icon: IoniconName) => (
		<Drawer.Screen
			name={name}
			options={{
				headerTitle: title,
				drawerLabel: ({ color, focused }) => (
					<Text style={{ color: focused ? color : themeColorForeground }}>
						{title}
					</Text>
				),
				drawerIcon: ({ size, color, focused }) => (
					<Ionicons
						color={focused ? color : themeColorForeground}
						name={icon}
						size={size}
					/>
				),
			}}
		/>
	);

	return (
		<Drawer
			screenOptions={{
				headerTintColor: themeColorForeground,
				headerStyle: { backgroundColor: themeColorBackground },
				headerTitleStyle: { fontWeight: "600", color: themeColorForeground },
				headerRight: renderThemeToggle,
				drawerStyle: { backgroundColor: themeColorBackground },
			}}
		>
			{screen("index", "Home", "home-outline")}
			{screen("leave", "My leave", "calendar-outline")}
			{screen("notifications", "Notifications", "notifications-outline")}
		</Drawer>
	);
}

export default DrawerLayout;
