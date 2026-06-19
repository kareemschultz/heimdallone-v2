import { Checkbox, Label } from "@Heimdallone/ui";

const frame: React.CSSProperties = {
	background: "var(--bg)",
	color: "var(--fg)",
	padding: 20,
	display: "flex",
	flexDirection: "column",
	gap: 12,
};

const rowStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 8,
};

export const States = () => (
	<div style={frame}>
		<div style={rowStyle}>
			<Checkbox defaultChecked id="c1" />
			<Label htmlFor="c1">Email notifications</Label>
		</div>
		<div style={rowStyle}>
			<Checkbox id="c2" />
			<Label htmlFor="c2">SMS notifications</Label>
		</div>
		<div style={rowStyle}>
			<Checkbox defaultChecked disabled id="c3" />
			<Label htmlFor="c3">Locked (admin only)</Label>
		</div>
	</div>
);
