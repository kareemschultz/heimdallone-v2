import { Button } from "@Heimdallone/ui";

const row: React.CSSProperties = {
	display: "flex",
	gap: 8,
	flexWrap: "wrap",
	alignItems: "center",
};

export const Variants = () => (
	<div style={row}>
		<Button variant="default">Save changes</Button>
		<Button variant="secondary">Secondary</Button>
		<Button variant="outline">Outline</Button>
		<Button variant="ghost">Ghost</Button>
		<Button variant="destructive">Delete</Button>
		<Button variant="link">Learn more</Button>
	</div>
);

export const Sizes = () => (
	<div style={row}>
		<Button size="xs">Extra small</Button>
		<Button size="sm">Small</Button>
		<Button size="default">Default</Button>
		<Button size="lg">Large</Button>
	</div>
);

export const Disabled = () => (
	<div style={row}>
		<Button disabled>Disabled</Button>
		<Button disabled variant="outline">
			Disabled
		</Button>
	</div>
);
