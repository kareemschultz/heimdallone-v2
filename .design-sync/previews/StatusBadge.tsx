import { StatusBadge } from "@Heimdallone/ui";

const frame: React.CSSProperties = {
	background: "var(--bg)",
	color: "var(--fg)",
	padding: 20,
	display: "flex",
	gap: 8,
	flexWrap: "wrap",
	alignItems: "center",
};

export const Variants = () => (
	<div style={frame}>
		<StatusBadge variant="default">Draft</StatusBadge>
		<StatusBadge variant="success">Active</StatusBadge>
		<StatusBadge variant="warning">Pending</StatusBadge>
		<StatusBadge variant="danger">Rejected</StatusBadge>
		<StatusBadge variant="info">In review</StatusBadge>
		<StatusBadge variant="accent">Featured</StatusBadge>
	</div>
);

export const WithDot = () => (
	<div style={frame}>
		<StatusBadge dot variant="success">
			Online
		</StatusBadge>
		<StatusBadge dot variant="warning">
			Away
		</StatusBadge>
		<StatusBadge dot variant="danger">
			Offline
		</StatusBadge>
	</div>
);
