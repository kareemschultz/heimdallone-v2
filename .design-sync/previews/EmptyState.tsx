import { EmptyState } from "@Heimdallone/ui";
import { Inbox } from "lucide-react";

const frame: React.CSSProperties = {
	background: "var(--bg)",
	color: "var(--fg)",
	padding: 20,
};

export const Default = () => (
	<div style={frame}>
		<EmptyState
			action={{ label: "Create request", href: "#" }}
			description="When someone files a helpdesk request, it will show up here."
			icon={Inbox}
			title="No requests yet"
		/>
	</div>
);

export const Compact = () => (
	<div style={frame}>
		<EmptyState
			compact
			description="No results match these filters."
			title="Nothing to show"
		/>
	</div>
);
