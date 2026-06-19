import {
	Button,
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@Heimdallone/ui";

export const Basic = () => (
	<div style={{ maxWidth: 360 }}>
		<Card>
			<CardHeader>
				<CardTitle>Monthly payroll</CardTitle>
				<CardDescription>September 2026 pay run</CardDescription>
				<CardAction>
					<Button size="sm" variant="outline">
						View
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent>
				<div style={{ fontSize: 28, fontWeight: 700 }}>GYD 24,574,289</div>
				<div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
					248 employees · gross + employer contributions
				</div>
			</CardContent>
			<CardFooter>
				<Button size="sm">Approve run</Button>
				<Button size="sm" variant="ghost">
					Cancel
				</Button>
			</CardFooter>
		</Card>
	</div>
);
