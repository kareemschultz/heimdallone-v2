import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Card, Chip, useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/utils/orpc";

export default function Home() {
	const healthCheck = useQuery(orpc.healthCheck.queryOptions());
	const { data: session } = authClient.useSession();
	const isConnected = healthCheck?.data === "OK";

	const foregroundColor = useThemeColor("foreground");
	const mutedColor = useThemeColor("muted");

	const unread = useQuery({
		...orpc.notifications.unreadCount.queryOptions(),
		enabled: !!session?.user,
	});
	const balances = useQuery({
		...orpc.leave.balances.list.queryOptions({ input: {} }),
		enabled: !!session?.user,
	});

	if (!session?.user) {
		return (
			<Container className="p-6">
				<View className="mb-6 py-4">
					<Text className="mb-1 font-bold text-3xl text-foreground">
						Heimdallone
					</Text>
					<Text className="text-muted text-sm">Sign in to your workspace</Text>
				</View>
				<SignIn />
				<SignUp />
			</Container>
		);
	}

	const unreadCount = unread.data?.count ?? 0;
	const balanceRows = balances.data ?? [];
	const totalAvailable = balanceRows.reduce(
		(sum, b) => sum + Number(b.availableDays ?? 0),
		0
	);

	return (
		<Container className="p-6">
			<View className="mb-6 py-2">
				<Text className="text-muted text-sm">Welcome back,</Text>
				<Text className="font-bold text-3xl text-foreground">
					{session.user.name}
				</Text>
				<View className="mt-2 flex-row items-center">
					<View
						className={`mr-2 h-2 w-2 rounded-full ${isConnected ? "bg-success" : "bg-muted"}`}
					/>
					<Text className="text-muted text-xs">
						{isConnected ? "Connected" : "Offline"}
					</Text>
				</View>
			</View>

			<View className="mb-4 flex-row gap-3">
				<Card className="flex-1 p-4" variant="secondary">
					<Text className="mb-1 text-muted text-xs">Unread</Text>
					<Text className="font-bold text-2xl text-foreground">
						{unreadCount}
					</Text>
					<Text className="text-muted text-xs">notifications</Text>
				</Card>
				<Card className="flex-1 p-4" variant="secondary">
					<Text className="mb-1 text-muted text-xs">Leave</Text>
					<Text className="font-bold text-2xl text-foreground">
						{totalAvailable}
					</Text>
					<Text className="text-muted text-xs">days available</Text>
				</Card>
			</View>

			<Card className="mb-4 p-2" variant="secondary">
				<Link asChild href="/notifications">
					<Pressable className="flex-row items-center justify-between p-3 active:opacity-70">
						<View className="flex-row items-center">
							<Ionicons
								color={foregroundColor}
								name="notifications-outline"
								size={20}
							/>
							<Text className="ml-3 font-medium text-foreground">
								Notifications
							</Text>
						</View>
						<View className="flex-row items-center">
							{unreadCount > 0 ? (
								<Chip color="danger" size="sm" variant="secondary">
									<Chip.Label>{String(unreadCount)}</Chip.Label>
								</Chip>
							) : null}
							<Ionicons
								color={mutedColor}
								name="chevron-forward"
								size={18}
								style={{ marginLeft: 6 }}
							/>
						</View>
					</Pressable>
				</Link>
				<Link asChild href="/leave">
					<Pressable className="flex-row items-center justify-between p-3 active:opacity-70">
						<View className="flex-row items-center">
							<Ionicons
								color={foregroundColor}
								name="calendar-outline"
								size={20}
							/>
							<Text className="ml-3 font-medium text-foreground">My leave</Text>
						</View>
						<Ionicons color={mutedColor} name="chevron-forward" size={18} />
					</Pressable>
				</Link>
			</Card>

			<Pressable
				className="mt-2 self-start rounded-lg bg-danger px-4 py-3 active:opacity-70"
				onPress={() => {
					authClient.signOut();
					queryClient.invalidateQueries();
				}}
			>
				<Text className="font-medium text-foreground">Sign out</Text>
			</Pressable>
		</Container>
	);
}
