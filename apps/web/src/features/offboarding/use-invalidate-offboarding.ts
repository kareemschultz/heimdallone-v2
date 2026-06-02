import { useQueryClient } from "@tanstack/react-query";

/**
 * Returns a function that invalidates every offboarding query (cases, tasks,
 * assets, access, documents, interviews, activity, settlement). oRPC query keys
 * are shaped `[[router, ...path], { input }]`, so matching on `path[0]` is the
 * reliable way to refetch the whole module after a mutation.
 */
export function useInvalidateOffboarding(): () => void {
	const queryClient = useQueryClient();
	return () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "offboarding";
			},
		});
}
