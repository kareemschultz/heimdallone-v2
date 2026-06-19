import { StatTile, StatTileGrid } from "@Heimdallone/ui";
import { DollarSign, Package, TrendingUp, Users } from "lucide-react";

export const Tones = () => (
	<StatTileGrid min={180}>
		<StatTile icon={Users} label="Active employees" value="248" />
		<StatTile
			icon={DollarSign}
			label="Monthly payroll"
			tone="primary"
			value="GYD 24.5M"
		/>
		<StatTile
			hint="reorder needed"
			label="Low stock"
			tone="warning"
			value="3"
		/>
		<StatTile icon={Package} label="Overdue tasks" tone="danger" value="7" />
	</StatTileGrid>
);

export const WithDelta = () => (
	<StatTileGrid min={220}>
		<StatTile
			delta={{ direction: "up", value: "12%", label: "vs last month" }}
			icon={TrendingUp}
			label="Revenue"
			tone="success"
			value="GYD 1.24M"
		/>
		<StatTile
			delta={{ direction: "down", value: "4%", label: "vs last month" }}
			label="Open requests"
			value="18"
		/>
	</StatTileGrid>
);
