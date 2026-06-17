import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/accept-invitation/$id")({
	component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const session = authClient.useSession();
	const isSignedIn = !!session.data?.user;

	const invitationQuery = useQuery({
		queryKey: ["invitation", id],
		enabled: isSignedIn,
		queryFn: async () => {
			const res = await authClient.organization.getInvitation({
				query: { id },
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Invitation not found");
			}
			return res.data;
		},
	});

	const accept = useMutation({
		mutationFn: async () => {
			const res = await authClient.organization.acceptInvitation({
				invitationId: id,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Could not accept invitation");
			}
		},
		onSuccess: () => {
			toast.success("Invitation accepted. Welcome!");
			navigate({ to: "/app" });
		},
		onError: (err: Error) => toast.error(err.message),
	});

	return (
		<div
			style={{
				display: "flex",
				minHeight: "100vh",
				alignItems: "center",
				justifyContent: "center",
				padding: 20,
				background: "var(--bg-1, #0b0d12)",
			}}
		>
			<div
				className="card card-pad-lg"
				style={{ width: "100%", maxWidth: 440, textAlign: "center" }}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "center",
						marginBottom: 12,
					}}
				>
					<ShieldCheck size={34} />
				</div>
				<h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>
					Join your workspace
				</h1>

				{session.isPending && (
					<p className="page-sub">
						<Loader2 className="spin" size={14} /> Checking your session…
					</p>
				)}

				{!(session.isPending || isSignedIn) && (
					<>
						<p className="page-sub">
							Sign in with the email this invitation was sent to, then return
							here to accept.
						</p>
						<Link
							className="btn btn-primary"
							style={{ marginTop: 12 }}
							to="/login"
						>
							<Mail size={14} />
							Sign in to continue
						</Link>
					</>
				)}

				{isSignedIn && invitationQuery.isLoading && (
					<p className="page-sub">
						<Loader2 className="spin" size={14} /> Loading invitation…
					</p>
				)}

				{isSignedIn && invitationQuery.isError && (
					<p className="page-sub" style={{ color: "var(--danger)" }}>
						This invitation is invalid, expired, or already used. Ask an admin
						to send a new one.
					</p>
				)}

				{isSignedIn && invitationQuery.data && (
					<>
						<p className="page-sub">
							You've been invited to join{" "}
							<strong>
								{invitationQuery.data.organizationName ?? "this workspace"}
							</strong>
							{invitationQuery.data.email
								? ` as ${invitationQuery.data.email}`
								: ""}
							.
						</p>
						<button
							className="btn btn-primary"
							disabled={accept.isPending}
							onClick={() => accept.mutate()}
							style={{ marginTop: 12 }}
							type="button"
						>
							<Check size={14} />
							{accept.isPending ? "Accepting…" : "Accept invitation"}
						</button>
					</>
				)}
			</div>
		</div>
	);
}
