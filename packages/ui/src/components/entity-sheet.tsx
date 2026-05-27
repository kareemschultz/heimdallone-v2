import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@Heimdallone/ui/components/sheet";
import { cn } from "@Heimdallone/ui/lib/utils";
import { X } from "lucide-react";

interface EntitySheetProps {
	avatar?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	footer?: React.ReactNode;
	headerActions?: React.ReactNode;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	subtitle?: string;
	title?: string;
	width?: number | string;
}

function EntitySheet({
	open,
	onOpenChange,
	title,
	subtitle,
	avatar,
	headerActions,
	footer,
	width = 460,
	children,
	className,
}: EntitySheetProps) {
	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent
				className={cn("entity-sheet", className)}
				showCloseButton={false}
				side="right"
				style={{
					width: typeof width === "number" ? `${width}px` : width,
					maxWidth: "100vw",
					display: "flex",
					flexDirection: "column",
					background: "var(--bg-1)",
					borderLeft: "1px solid var(--line)",
				}}
			>
				{title && (
					<SheetHeader
						style={{
							display: "flex",
							flexDirection: "row",
							alignItems: "flex-start",
							justifyContent: "space-between",
							gap: 14,
							padding: "18px 20px",
							borderBottom: "1px solid var(--line)",
						}}
					>
						<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
							{avatar}
							<div>
								<SheetTitle
									style={{
										fontSize: "18px",
										fontWeight: 600,
										letterSpacing: "-0.015em",
										color: "var(--fg)",
									}}
								>
									{title}
								</SheetTitle>
								{subtitle && (
									<div
										style={{
											fontSize: "12px",
											color: "var(--fg-3)",
											marginTop: 4,
										}}
									>
										{subtitle}
									</div>
								)}
							</div>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							{headerActions}
							<SheetClose
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									width: 28,
									height: 28,
									borderRadius: 8,
									border: "1px solid var(--line)",
									background: "var(--bg-3)",
									color: "var(--fg-3)",
									cursor: "pointer",
								}}
							>
								<X size={14} />
							</SheetClose>
						</div>
					</SheetHeader>
				)}

				<div
					style={{
						flex: 1,
						padding: "18px 20px 24px",
						overflowY: "auto",
					}}
				>
					{children}
				</div>

				{footer && (
					<SheetFooter
						style={{
							display: "flex",
							flexDirection: "row",
							gap: 8,
							alignItems: "center",
							padding: "14px 20px",
							borderTop: "1px solid var(--line)",
						}}
					>
						{footer}
					</SheetFooter>
				)}
			</SheetContent>
		</Sheet>
	);
}

export type { EntitySheetProps };
export { EntitySheet };
