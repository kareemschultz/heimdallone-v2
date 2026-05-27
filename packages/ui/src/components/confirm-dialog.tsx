import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@Heimdallone/ui/components/alert-dialog";

interface ConfirmDialogProps {
	cancelLabel?: string;
	confirmLabel?: string;
	description: string;
	loading?: boolean;
	onConfirm: () => void | Promise<void>;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	title: string;
	variant?: "default" | "destructive";
}

function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	variant = "default",
	onConfirm,
	loading = false,
}: ConfirmDialogProps) {
	const handleConfirm = async () => {
		await onConfirm();
		onOpenChange(false);
	};

	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction
						disabled={loading}
						onClick={handleConfirm}
						variant={variant === "destructive" ? "destructive" : "default"}
					>
						{loading ? "Processing…" : confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export type { ConfirmDialogProps };
export { ConfirmDialog };
