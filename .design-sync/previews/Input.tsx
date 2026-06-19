import { Input, Label } from "@Heimdallone/ui";

const frame: React.CSSProperties = {
	background: "var(--bg)",
	color: "var(--fg)",
	padding: 20,
	display: "flex",
	flexDirection: "column",
	gap: 14,
	maxWidth: 320,
};

export const States = () => (
	<div style={frame}>
		<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
			<Label htmlFor="name">Full name</Label>
			<Input defaultValue="Andre Sealey" id="name" />
		</div>
		<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
			<Label htmlFor="email">Work email</Label>
			<Input id="email" placeholder="name@company.com" type="email" />
		</div>
		<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
			<Label htmlFor="disabled">Employee ID</Label>
			<Input defaultValue="EMP-000123" disabled id="disabled" />
		</div>
	</div>
);
