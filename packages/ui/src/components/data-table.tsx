import { cn } from "@Heimdallone/ui/lib/utils";
import {
	type ColumnDef,
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
} from "lucide-react";
import { useState } from "react";

type Density = "comfortable" | "default" | "compact";

function ariaSortValue(
	sorted: false | "asc" | "desc"
): "ascending" | "descending" | undefined {
	if (sorted === "asc") {
		return "ascending";
	}
	if (sorted === "desc") {
		return "descending";
	}
	return;
}

interface DataTableProps<TData> {
	className?: string;
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	defaultPageSize?: number;
	density?: Density;
	emptyState?: React.ReactNode;
	enableColumnVisibility?: boolean;
	enablePagination?: boolean;
	enableRowSelection?: boolean;
	enableSearch?: boolean;
	enableSorting?: boolean;
	errorMessage?: string;
	isError?: boolean;
	isLoading?: boolean;
	loadingRowCount?: number;
	onRetry?: () => void;
	onRowClick?: (row: TData) => void;
	onSelectionChange?: (selected: TData[]) => void;
	pageSizeOptions?: number[];
	searchPlaceholder?: string;
}

function DataTable<TData>({
	columns,
	data,
	enableSorting = true,
	enablePagination = true,
	enableRowSelection = false,
	pageSizeOptions = [25, 50, 100],
	defaultPageSize = 50,
	density = "default",
	onRowClick,
	emptyState,
	loadingRowCount = 5,
	isLoading = false,
	isError = false,
	errorMessage = "Unable to load data. Check your connection and try again.",
	onRetry,
	className,
}: DataTableProps<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const table = useReactTable({
		data,
		columns,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
		},
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: enablePagination
			? getPaginationRowModel()
			: undefined,
		enableRowSelection,
		initialState: {
			pagination: { pageSize: defaultPageSize },
		},
	});

	if (isError) {
		return (
			<div
				className={cn(className)}
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: 12,
					padding: "48px 24px",
					textAlign: "center",
				}}
			>
				<p style={{ fontSize: "13px", color: "var(--fg-3)" }}>{errorMessage}</p>
				{onRetry && (
					<button
						className="btn btn-outline btn-sm"
						onClick={onRetry}
						type="button"
					>
						Retry
					</button>
				)}
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className={cn(className)} data-density={density}>
				<table className="tbl">
					<thead>
						<tr>
							{columns.map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton header placeholders never reorder
								<th key={`sk-h-${i}`}>
									<div
										style={{
											height: 12,
											width: "60%",
											borderRadius: 4,
											background: "var(--bg-3)",
										}}
									/>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{Array.from({ length: loadingRowCount }).map((_, ri) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows never reorder
							<tr key={`sk-r-${ri}`}>
								{columns.map((_, ci) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells never reorder
									<td key={`sk-c-${ci}`}>
										<div
											className="skeleton"
											style={{
												height: 14,
												width: `${55 + Math.random() * 35}%`,
												borderRadius: 4,
												background: "var(--bg-3)",
												animation: "pulse 1.5s ease-in-out infinite",
											}}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	}

	if (!isLoading && data.length === 0) {
		return <div className={cn(className)}>{emptyState}</div>;
	}

	const pageIndex = table.getState().pagination.pageIndex;
	const pageSize = table.getState().pagination.pageSize;
	const totalRows = table.getFilteredRowModel().rows.length;
	const startRow = pageIndex * pageSize + 1;
	const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);

	return (
		<div className={cn(className)} data-density={density}>
			<table className="tbl">
				<thead>
					<tr>
						{table.getHeaderGroups()[0]?.headers.map((header) => {
							const canSort = header.column.getCanSort();
							const sorted = header.column.getIsSorted();
							return (
								<th
									aria-sort={ariaSortValue(sorted)}
									key={header.id}
									onClick={
										canSort
											? header.column.getToggleSortingHandler()
											: undefined
									}
									style={{ cursor: canSort ? "pointer" : "default" }}
								>
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 4,
										}}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext()
												)}
										{canSort && sorted === "asc" && <ChevronUp size={12} />}
										{canSort && sorted === "desc" && <ChevronDown size={12} />}
									</span>
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{table.getRowModel().rows.map((row) => (
						<tr
							aria-selected={row.getIsSelected() || undefined}
							data-selected={row.getIsSelected() || undefined}
							key={row.id}
							onClick={onRowClick ? () => onRowClick(row.original) : undefined}
							style={{ cursor: onRowClick ? "pointer" : undefined }}
						>
							{row.getVisibleCells().map((cell) => (
								<td key={cell.id}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>

			{enablePagination && totalRows > pageSize && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "12px 0",
						fontSize: "12px",
						color: "var(--fg-3)",
					}}
				>
					<span>
						Showing {startRow}–{endRow} of {totalRows}
					</span>
					<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<select
							onChange={(e) => table.setPageSize(Number(e.target.value))}
							style={{
								height: 28,
								padding: "0 8px",
								fontSize: "12px",
								background: "var(--bg-3)",
								border: "1px solid var(--line)",
								borderRadius: 6,
								color: "var(--fg-2)",
							}}
							value={pageSize}
						>
							{pageSizeOptions.map((size) => (
								<option key={size} value={size}>
									{size} / page
								</option>
							))}
						</select>
						<button
							className="btn btn-ghost btn-sm"
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.previousPage()}
							type="button"
						>
							<ChevronLeft size={14} />
						</button>
						<span style={{ padding: "0 8px" }}>
							{pageIndex + 1} / {table.getPageCount()}
						</span>
						<button
							className="btn btn-ghost btn-sm"
							disabled={!table.getCanNextPage()}
							onClick={() => table.nextPage()}
							type="button"
						>
							<ChevronRight size={14} />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export type { ColumnDef } from "@tanstack/react-table";
export type { DataTableProps, Density };
export { DataTable };
