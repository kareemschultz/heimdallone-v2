import { Skeleton } from "@Heimdallone/ui";

const frame: React.CSSProperties = {
	background: "var(--bg)",
	color: "var(--fg)",
	padding: 20,
	display: "flex",
	flexDirection: "column",
	gap: 10,
	maxWidth: 320,
};

export const Loading = () => (
	<div style={frame}>
		<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
			<Skeleton style={{ width: 40, height: 40, borderRadius: 999 }} />
			<div
				style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}
			>
				<Skeleton style={{ width: "60%", height: 12 }} />
				<Skeleton style={{ width: "40%", height: 12 }} />
			</div>
		</div>
		<Skeleton style={{ width: "100%", height: 80 }} />
		<Skeleton style={{ width: "80%", height: 12 }} />
	</div>
);
