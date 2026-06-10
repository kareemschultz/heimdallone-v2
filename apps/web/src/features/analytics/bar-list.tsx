export interface BarListItem {
	display: string;
	key: string;
	label: string;
	value: number;
}

interface BarListProps {
	emptyLabel?: string;
	items: BarListItem[];
}

/**
 * Lightweight horizontal bar chart (track + fill, max-normalised). Matches the
 * existing CSS-chart pattern in payroll/recruitment reports — no charting
 * dependency. Bars carry a text label + value, so they are never colour-only.
 */
export function BarList({ items, emptyLabel = "No data yet." }: BarListProps) {
	if (items.length === 0) {
		return <p className="an-empty">{emptyLabel}</p>;
	}
	const max = Math.max(...items.map((i) => i.value), 1);
	return (
		<div className="an-bars">
			{items.map((item) => {
				const pct = Math.max(2, Math.round((item.value / max) * 100));
				return (
					<div className="an-bar-row" key={item.key}>
						<span className="an-bar-label">{item.label}</span>
						<span className="an-bar-track">
							<span className="an-bar-fill" style={{ width: `${pct}%` }} />
						</span>
						<span className="an-bar-value">{item.display}</span>
					</div>
				);
			})}
		</div>
	);
}
