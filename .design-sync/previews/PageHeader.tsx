import { Button, PageHeader } from "@Heimdallone/ui";

const frame: React.CSSProperties = {
	background: "var(--bg)",
	color: "var(--fg)",
	padding: 20,
};

export const Default = () => (
	<div style={frame}>
		<PageHeader
			actions={
				<>
					<Button size="sm" variant="outline">
						Export
					</Button>
					<Button size="sm">New employee</Button>
				</>
			}
			description="248 active employees across 6 departments."
			title="Employees"
		/>
	</div>
);

export const TitleOnly = () => (
	<div style={frame}>
		<PageHeader description="September 2026 pay run" title="Payroll" />
	</div>
);
