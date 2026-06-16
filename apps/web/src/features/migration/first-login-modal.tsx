import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@Heimdallone/ui/components/alert-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";

// What a migrated user is asked to review on first sign-in (owner directive,
// Phase 21N). Plain language — these map to editable profile/statutory fields.
const REVIEW_ITEMS = [
	"Confirm your email, phone, address, and emergency contact.",
	"Check your tax and statutory details (TIN, NIS, dependents) where you can edit them.",
	"Review the new features now available to you.",
	"Report any incorrect payroll, leave, or attendance data to HR.",
];

/**
 * Required first-login onboarding modal for users migrated from v1. Shown once
 * (until acknowledged) — built on AlertDialog, which does not dismiss on outside
 * click or Escape; `open` is controlled and only cleared by an explicit action,
 * so it is dismissible ONLY after acknowledgement. Renders nothing for users who
 * were not migrated or have already acknowledged.
 */
export function FirstLoginModal() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const statusQuery = useQuery(orpc.migration.me.status.queryOptions({}));
	const [open, setOpen] = useState(false);

	const needsNotice = statusQuery.data?.needsNotice ?? false;
	useEffect(() => {
		if (needsNotice) {
			setOpen(true);
		}
	}, [needsNotice]);

	const acknowledge = useMutation({
		mutationFn: () => client.migration.me.acknowledge(),
	});

	const finish = () => {
		queryClient.invalidateQueries({ queryKey: orpc.migration.key() });
		setOpen(false);
	};

	const handleContinue = async () => {
		try {
			await acknowledge.mutateAsync();
			finish();
		} catch {
			toast.error("Could not save your acknowledgement. Please try again.");
		}
	};

	const handleReviewProfile = async () => {
		try {
			await acknowledge.mutateAsync();
			await client.migration.me.markProfileReviewed();
			finish();
			const employeeId = statusQuery.data?.employeeId;
			if (employeeId) {
				navigate({ to: "/app/employees/$id", params: { id: employeeId } });
			}
		} catch {
			toast.error("Could not open your profile. Please try again.");
		}
	};

	if (!needsNotice) {
		return null;
	}

	return (
		<AlertDialog
			onOpenChange={(next) => {
				// Ignore outside-click / Escape — only an action closes it.
				if (next) {
					setOpen(true);
				}
			}}
			open={open}
		>
			<AlertDialogContent className="max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-lg gap-3 overflow-y-auto">
				<AlertDialogHeader>
					<AlertDialogTitle>Welcome to Heimdallone v2</AlertDialogTitle>
					<AlertDialogDescription>
						Your account and profile were moved over from the previous system.
						Please take a moment to review your details so everything is
						correct.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<ul className="ml-4 list-disc space-y-1.5 text-foreground text-sm">
					{REVIEW_ITEMS.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
				<p className="text-muted-foreground text-xs">
					Depending on how your sign-in was migrated, you may be asked to set or
					reset your password.
				</p>
				<AlertDialogFooter>
					<AlertDialogAction
						disabled={acknowledge.isPending}
						onClick={handleContinue}
						variant="outline"
					>
						I understand — continue
					</AlertDialogAction>
					<AlertDialogAction
						disabled={acknowledge.isPending}
						onClick={handleReviewProfile}
					>
						Review my profile
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
