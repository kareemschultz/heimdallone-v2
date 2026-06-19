import { useQuery } from "@tanstack/react-query";
import { Card, Chip, useThemeColor } from "heroui-native";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { Container } from "@/components/container";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

function fmtDate(d: Date | string | null): string {
	if (!d) {
		return "—";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	return date.toISOString().slice(0, 10);
}

function statusColor(
	status: string
): "success" | "warning" | "danger" | "default" {
	if (status === "approved") {
		return "success";
	}
	if (status === "pending") {
		return "warning";
	}
	if (status === "rejected" || status === "cancelled") {
		return "danger";
	}
	return "default";
}

export default function Leave() {
	const { data: session } = authClient.useSession();
	const mutedColor = useThemeColor("muted");

	const balances = useQuery({
		...orpc.leave.balances.list.queryOptions({ input: {} }),
		enabled: !!session?.user,
	});
	const requests = useQuery({
		...orpc.leave.requests.list.queryOptions({ input: {} }),
		enabled: !!session?.user,
	});

	if (!session?.user) {
		return (
			<Container className="p-6">
				<Text className="text-foreground">Sign in to view your leave.</Text>
			</Container>
		);
	}

	if (balances.isLoading) {
		return (
			<Container className="flex-1 items-center justify-center p-6">
				<ActivityIndicator color={mutedColor} />
			</Container>
		);
	}

	const balanceRows = balances.data ?? [];
	const requestRows = requests.data?.data ?? [];

	return (
		<Container className="flex-1">
			<ScrollView className="flex-1 p-4" contentContainerClassName="gap-3">
				<Text className="font-semibold text-foreground text-lg">Balances</Text>
				{balanceRows.length === 0 ? (
					<Text className="text-muted text-sm">No leave balances yet.</Text>
				) : (
					balanceRows.map((b) => (
						<Card className="p-4" key={b.id} variant="secondary">
							<View className="flex-row items-center justify-between">
								<Text className="font-medium text-foreground">
									{b.leaveTypeName}
								</Text>
								<Text className="font-bold text-foreground">
									{Number(b.availableDays ?? 0)} days
								</Text>
							</View>
							<Text className="mt-1 text-muted text-xs">
								Used {Number(b.usedDays ?? 0)} · Carried{" "}
								{Number(b.carryForwardDays ?? 0)}
							</Text>
						</Card>
					))
				)}

				<Text className="mt-4 font-semibold text-foreground text-lg">
					My requests
				</Text>
				{requestRows.length === 0 ? (
					<Text className="text-muted text-sm">No leave requests.</Text>
				) : (
					requestRows.map((r) => (
						<Card className="p-4" key={r.id} variant="secondary">
							<View className="flex-row items-center justify-between">
								<Text className="flex-1 font-medium text-foreground">
									{r.leaveTypeName ?? "Leave"}
								</Text>
								<Chip
									color={statusColor(r.status)}
									size="sm"
									variant="secondary"
								>
									<Chip.Label>{r.status}</Chip.Label>
								</Chip>
							</View>
							<Text className="mt-1 text-muted text-xs">
								{fmtDate(r.startDate)} → {fmtDate(r.endDate)}
							</Text>
						</Card>
					))
				)}
			</ScrollView>
		</Container>
	);
}
