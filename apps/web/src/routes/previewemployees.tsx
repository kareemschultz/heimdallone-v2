import { createFileRoute } from "@tanstack/react-router";
import {
	ExternalLink,
	MoreHorizontal,
	Plus,
	Search,
	SlidersHorizontal,
} from "lucide-react";

export const Route = createFileRoute("/previewemployees")({
	component: PreviewEmployees,
});

interface Emp {
	badge: string;
	country: string;
	dept: string;
	first: string;
	id: string;
	last: string;
	location: string;
	position: string;
	status: "active" | "notice" | "probation" | "contract";
	statusLabel: string;
}

const EMPLOYEES: Emp[] = [
	{
		id: "1",
		first: "Amara",
		last: "Singh",
		badge: "EMP-0241",
		position: "Senior Engineer",
		dept: "Engineering",
		location: "Georgetown",
		country: "GY",
		status: "active",
		statusLabel: "Active",
	},
	{
		id: "2",
		first: "David",
		last: "Chen",
		badge: "EMP-0198",
		position: "Product Manager",
		dept: "Product",
		location: "Remote",
		country: "US",
		status: "notice",
		statusLabel: "On notice",
	},
	{
		id: "3",
		first: "Leah",
		last: "Roberts",
		badge: "EMP-0322",
		position: "Product Designer",
		dept: "Design",
		location: "London",
		country: "GB",
		status: "active",
		statusLabel: "Active",
	},
	{
		id: "4",
		first: "Marcus",
		last: "Allen",
		badge: "EMP-0410",
		position: "Financial Analyst",
		dept: "Finance",
		location: "Georgetown",
		country: "GY",
		status: "probation",
		statusLabel: "Probation",
	},
	{
		id: "5",
		first: "Priya",
		last: "Naidu",
		badge: "EMP-0377",
		position: "HR Generalist",
		dept: "People Ops",
		location: "Remote",
		country: "IN",
		status: "active",
		statusLabel: "Active",
	},
	{
		id: "6",
		first: "Tomas",
		last: "Becker",
		badge: "EMP-0451",
		position: "DevOps Engineer",
		dept: "Engineering",
		location: "Berlin",
		country: "DE",
		status: "contract",
		statusLabel: "Contract",
	},
];

function initials(f: string, l: string) {
	return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase();
}

function statusClass(s: Emp["status"]) {
	if (s === "active") {
		return "active";
	}
	if (s === "notice") {
		return "notice";
	}
	if (s === "probation") {
		return "probation";
	}
	return "contract";
}

function PreviewEmployees() {
	return (
		<div
			className="page"
			style={{ padding: "28px 32px", maxWidth: "1200px", margin: "0 auto" }}
		>
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>People</span>
						<span className="sep">/</span>
						<span>Employees</span>
					</div>
					<h1 className="page-title">Employees</h1>
					<p className="page-subtitle">248 people across 6 departments</p>
				</div>
				<button className="btn btn-primary" type="button">
					<Plus size={15} /> Add employee
				</button>
			</div>

			<div className="toolbar" style={{ marginTop: "20px" }}>
				<div className="search-wrap">
					<Search size={15} />
					<input
						className="search"
						placeholder="Search employees…"
						type="text"
					/>
				</div>
				<div className="toolbar-divider" />
				<div className="segmented">
					<button className="active" type="button">
						All
					</button>
					<button type="button">Active</button>
					<button type="button">Archived</button>
				</div>
				<div style={{ flex: 1 }} />
				<button className="btn btn-outline" type="button">
					<SlidersHorizontal size={15} /> Filters
				</button>
			</div>

			<div
				className="emp-list"
				data-density="comfortable"
				style={{ marginTop: "16px" }}
			>
				<table>
					<thead>
						<tr>
							<th className="sortable">Employee</th>
							<th className="sortable">Department</th>
							<th className="sortable">Location</th>
							<th className="sortable">Country</th>
							<th className="sortable">Status</th>
							<th style={{ width: "100px" }} />
						</tr>
					</thead>
					<tbody>
						{EMPLOYEES.map((emp) => (
							<tr key={emp.id} style={{ cursor: "pointer" }}>
								<td>
									<div className="emp-name">
										<div className="avatar-sm">
											{initials(emp.first, emp.last)}
										</div>
										<div>
											<div className="ttl">
												{emp.first} {emp.last}
											</div>
											<div className="sub">
												{emp.badge} · {emp.position}
											</div>
										</div>
									</div>
								</td>
								<td>
									<span style={{ color: "var(--fg-2)" }}>{emp.dept}</span>
								</td>
								<td>
									<span style={{ color: "var(--fg-2)" }}>{emp.location}</span>
								</td>
								<td>
									<span className="cc-badge">{emp.country}</span>
								</td>
								<td>
									<span className={`pill-status ${statusClass(emp.status)}`}>
										<span className="badge-dot" />
										{emp.statusLabel}
									</span>
								</td>
								<td>
									<div className="row-actions">
										<a href="#open" title="Open profile">
											<ExternalLink size={12} />
										</a>
										<button
											aria-label="More actions"
											title="More"
											type="button"
										>
											<MoreHorizontal size={12} />
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>

				<div className="pagination">
					<span>
						Showing{" "}
						<span className="mono" style={{ color: "var(--fg-2)" }}>
							1–6
						</span>{" "}
						of{" "}
						<span className="mono" style={{ color: "var(--fg-2)" }}>
							248
						</span>
					</span>
					<div className="pager">
						<button className="icon" disabled type="button">
							‹
						</button>
						<button className="active" type="button">
							1
						</button>
						<button type="button">2</button>
						<button type="button">3</button>
						<button className="icon" type="button">
							›
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
