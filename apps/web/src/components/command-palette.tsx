import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft, Search, User } from "lucide-react";
import {
	type ComponentType,
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { orpc } from "@/utils/orpc";

export interface CommandNavItem {
	group: string;
	href: string;
	icon: ComponentType<{ size?: number }>;
	key: string;
	label: string;
}

interface NavRow {
	context: string;
	href: string;
	icon: ComponentType<{ size?: number }>;
	id: string;
	kind: "nav";
	label: string;
}

interface PersonRow {
	context: string;
	href: string;
	id: string;
	kind: "person";
	label: string;
}

type Row = NavRow | PersonRow;

const DEBOUNCE_MS = 160;
const MIN_PEOPLE_QUERY = 2;
const PEOPLE_LIMIT = 6;

interface EmployeeRow {
	departmentName: string | null;
	email: string | null;
	firstName: string;
	id: string;
	jobPositionName: string | null;
	lastName: string;
}

/**
 * Global command palette. Opened with ⌘K / Ctrl+K (wired in the app shell) or
 * the topbar search button. Fuzzy-navigates the role-filtered hub navigation and
 * searches people via the RBAC-scoped employee list. Keyboard-first: ↑/↓ move,
 * Enter opens, Esc closes; the backdrop also closes it. Styling lives in
 * heimdall.css (`.cmd-*`).
 */
export function CommandPalette({
	open,
	onClose,
	navItems,
}: {
	navItems: CommandNavItem[];
	onClose: () => void;
	open: boolean;
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		setQuery("");
		setDebounced("");
		setActiveIndex(0);
		const t = setTimeout(() => inputRef.current?.focus(), 20);
		return () => clearTimeout(t);
	}, [open]);

	useEffect(() => {
		const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [query]);

	const q = debounced.toLowerCase();
	const peopleEnabled = open && debounced.length >= MIN_PEOPLE_QUERY;
	const peopleQuery = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { search: debounced, pageSize: PEOPLE_LIMIT },
			enabled: peopleEnabled,
		})
	);

	const navMatches = useMemo(() => {
		if (!q) {
			return navItems;
		}
		return navItems.filter(
			(n) =>
				n.label.toLowerCase().includes(q) || n.group.toLowerCase().includes(q)
		);
	}, [navItems, q]);

	const rows = useMemo<Row[]>(() => {
		const out: Row[] = navMatches.map((n) => ({
			kind: "nav",
			id: `nav:${n.key}`,
			label: n.label,
			context: n.group,
			href: n.href,
			icon: n.icon,
		}));
		if (peopleEnabled) {
			const people = (peopleQuery.data?.data ?? []) as EmployeeRow[];
			for (const p of people) {
				const name = `${p.firstName} ${p.lastName}`.trim();
				const ctx =
					[p.jobPositionName, p.departmentName].filter(Boolean).join(" · ") ||
					"Employee";
				out.push({
					kind: "person",
					id: `person:${p.id}`,
					label: name || p.email || "Employee",
					context: ctx,
					href: `/app/employees/${p.id}`,
				});
			}
		}
		return out;
	}, [navMatches, peopleEnabled, peopleQuery.data]);

	useEffect(() => {
		setActiveIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
	}, [rows.length]);

	const go = useCallback(
		(href: string) => {
			onClose();
			navigate({ to: href });
		},
		[navigate, onClose]
	);

	useEffect(() => {
		if (!open) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setActiveIndex((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				const row = rows[activeIndex];
				if (row) {
					go(row.href);
				}
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, rows, activeIndex, go, onClose]);

	useEffect(() => {
		if (activeIndex < 0) {
			return;
		}
		const el = listRef.current?.querySelector<HTMLElement>(
			'[data-active="true"]'
		);
		el?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	if (!open) {
		return null;
	}

	let lastKind: Row["kind"] | null = null;

	return (
		<>
			<button
				aria-label="Close search"
				className="cmd-overlay"
				onClick={onClose}
				type="button"
			/>
			<div
				aria-label="Command palette"
				aria-modal="true"
				className="cmd-palette"
				role="dialog"
			>
				<div className="cmd-input-row">
					<Search className="cmd-input-icon" size={16} />
					<input
						aria-label="Search navigation and people"
						className="cmd-input"
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Find anyone, anything…"
						ref={inputRef}
						value={query}
					/>
					<span className="cmd-esc">Esc</span>
				</div>

				<div className="cmd-results" ref={listRef}>
					{rows.length === 0 ? (
						<p className="cmd-empty">
							{peopleEnabled && peopleQuery.isFetching
								? "Searching…"
								: "No matches."}
						</p>
					) : null}
					{rows.map((row, i) => {
						const header =
							row.kind === lastKind ? null : (
								<div className="cmd-group-label" key={`h:${row.kind}`}>
									{row.kind === "nav" ? "Go to" : "People"}
								</div>
							);
						lastKind = row.kind;
						return (
							<Fragment key={row.id}>
								{header}
								<button
									className="cmd-row"
									data-active={i === activeIndex ? "true" : "false"}
									onClick={() => go(row.href)}
									onMouseMove={() => setActiveIndex(i)}
									type="button"
								>
									<span className="cmd-row-icon">
										{row.kind === "nav" ? (
											<row.icon size={16} />
										) : (
											<User size={16} />
										)}
									</span>
									<span className="cmd-row-text">
										<span className="cmd-row-label">{row.label}</span>
										<span className="cmd-row-ctx">{row.context}</span>
									</span>
									{i === activeIndex ? (
										<CornerDownLeft className="cmd-row-enter" size={14} />
									) : null}
								</button>
							</Fragment>
						);
					})}
				</div>

				<div className="cmd-foot">
					<span>
						<span className="cmd-kbd">↑</span>
						<span className="cmd-kbd">↓</span> to navigate
					</span>
					<span>
						<span className="cmd-kbd">↵</span> to open
					</span>
					<span>
						<span className="cmd-kbd">esc</span> to close
					</span>
				</div>
			</div>
		</>
	);
}
