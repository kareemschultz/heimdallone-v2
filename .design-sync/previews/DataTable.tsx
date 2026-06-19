import { DataTable, StatusBadge } from "@Heimdallone/ui";
import type { ColumnDef } from "@tanstack/react-table";

const frame: React.CSSProperties = {
	background: "var(--bg)",
	color: "var(--fg)",
	padding: 20,
};

type Employee = {
	name: string;
	department: string;
	location: string;
	status: "Active" | "On leave";
};

const data: Employee[] = [
	{
		name: "Andre Sealey",
		department: "Engineering",
		location: "Georgetown",
		status: "Active",
	},
	{
		name: "Shanice Powell",
		department: "People Ops",
		location: "Georgetown",
		status: "Active",
	},
	{
		name: "Dwayne Wilson",
		department: "Field Services",
		location: "Linden",
		status: "On leave",
	},
	{
		name: "Rohan Gopaul",
		department: "Finance",
		location: "Georgetown",
		status: "Active",
	},
];

const columns: ColumnDef<Employee, unknown>[] = [
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "department", header: "Department" },
	{ accessorKey: "location", header: "Location" },
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<StatusBadge
				variant={row.original.status === "Active" ? "success" : "warning"}
			>
				{row.original.status}
			</StatusBadge>
		),
	},
];

export const Default = () => (
	<div style={frame}>
		<DataTable columns={columns} data={data} />
	</div>
);

export const Empty = () => (
	<div style={frame}>
		<DataTable
			columns={columns}
			data={[]}
			emptyState={
				<div style={{ padding: 24, textAlign: "center", color: "var(--fg-3)" }}>
					No employees match these filters.
				</div>
			}
		/>
	</div>
);

export const Loading = () => (
	<div style={frame}>
		<DataTable columns={columns} data={[]} isLoading />
	</div>
);
