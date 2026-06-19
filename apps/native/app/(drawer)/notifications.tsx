import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, useThemeColor } from "heroui-native";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";

import { Container } from "@/components/container";
import { authClient } from "@/lib/auth-client";
import { client, orpc, queryClient } from "@/utils/orpc";

export default function Notifications() {
	const { data: session } = authClient.useSession();
	const mutedColor = useThemeColor("muted");

	const list = useQuery({
		...orpc.notifications.list.queryOptions({ input: {} }),
		enabled: !!session?.user,
	});

	const markRead = useMutation({
		mutationFn: (id: string) => client.notifications.markRead({ id }),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});

	if (!session?.user) {
		return (
			<Container className="p-6">
				<Text className="text-foreground">Sign in to view notifications.</Text>
			</Container>
		);
	}

	if (list.isLoading) {
		return (
			<Container className="flex-1 items-center justify-center p-6">
				<ActivityIndicator color={mutedColor} />
			</Container>
		);
	}

	const rows = list.data ?? [];

	if (list.isError) {
		return (
			<Container className="p-6">
				<Text className="text-foreground">
					Couldn't load notifications. Pull to retry.
				</Text>
			</Container>
		);
	}

	if (rows.length === 0) {
		return (
			<Container className="p-6">
				<Text className="text-muted">You're all caught up.</Text>
			</Container>
		);
	}

	return (
		<Container className="flex-1">
			<ScrollView className="flex-1 p-4" contentContainerClassName="gap-3">
				{rows.map((n) => {
					const isUnread = !n.readAt;
					return (
						<Pressable
							key={n.id}
							onPress={() => {
								if (isUnread) {
									markRead.mutate(n.id);
								}
							}}
						>
							<Card className="p-4" variant="secondary">
								<View className="flex-row items-center justify-between">
									<Text className="flex-1 font-medium text-foreground">
										{n.title}
									</Text>
									{isUnread ? (
										<View className="ml-2 h-2 w-2 rounded-full bg-danger" />
									) : null}
								</View>
								{n.body ? (
									<Text className="mt-1 text-muted text-sm">{n.body}</Text>
								) : null}
							</Card>
						</Pressable>
					);
				})}
			</ScrollView>
		</Container>
	);
}
