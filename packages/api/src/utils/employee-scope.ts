import { db } from "@Heimdallone/db";
import {
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import { and, eq } from "drizzle-orm";

import { canManageHR, canManagePayroll, canViewPayroll } from "./role-helpers";

export async function resolveCurrentEmployee(
	organizationId: string,
	userId: string
): Promise<{ id: string; firstName: string; lastName: string | null } | null> {
	const [emp] = await db
		.select({
			id: employeeProfile.id,
			firstName: employeeProfile.firstName,
			lastName: employeeProfile.lastName,
		})
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, organizationId),
				eq(employeeProfile.userId, userId)
			)
		)
		.limit(1);
	return emp ?? null;
}

export async function getDirectReportIds(
	employeeId: string
): Promise<string[]> {
	const reports = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.innerJoin(
			employeeWorkInfo,
			eq(employeeProfile.id, employeeWorkInfo.employeeId)
		)
		.where(eq(employeeWorkInfo.reportingManagerId, employeeId));
	return reports.map((r) => r.id);
}

export function canReadAllEmployees(role: string): boolean {
	return canViewPayroll(role);
}

export function canMutateEmployees(role: string): boolean {
	return canManageHR(role);
}

export function canReadFullBankDetails(role: string): boolean {
	return canManagePayroll(role);
}

export function isReadOnlyRole(role: string): boolean {
	return role === "auditor";
}

export async function checkReportingManagerCycle(
	employeeId: string,
	newManagerId: string
): Promise<boolean> {
	if (employeeId === newManagerId) {
		return true;
	}

	let currentId: string | null = newManagerId;
	const visited = new Set<string>();
	visited.add(employeeId);

	for (let depth = 0; depth < 20; depth++) {
		if (!currentId) {
			return false;
		}
		if (visited.has(currentId)) {
			return true;
		}
		visited.add(currentId);

		const [info] = await db
			.select({ managerId: employeeWorkInfo.reportingManagerId })
			.from(employeeWorkInfo)
			.where(eq(employeeWorkInfo.employeeId, currentId))
			.limit(1);

		currentId = info?.managerId ?? null;
	}

	return false;
}
