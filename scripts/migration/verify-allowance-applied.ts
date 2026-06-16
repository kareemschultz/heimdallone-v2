// Read-only proof that a future payroll run applies the migrated recurring
// transport allowance. Builds the real PayrollInput for a transport-allowance
// employee + a pay period, runs the engine, and prints the allowance line +
// gross/taxable/PAYE/net. NO writes.
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && bun run scripts/migration/verify-allowance-applied.ts <employeeId> <periodId>

import { buildPayrollInput } from "../../packages/api/src/utils/payroll-input-builder";
import { calculatePayroll } from "../../packages/payroll-engine/src/calculate";

const ORG = "netsurf-group-tenant-001";
const EMP = process.argv[2] ?? "HR-EMP-00008"; // Janita George — transport 7000
const PERIOD = process.argv[3] ?? "";

async function main() {
	if (!PERIOD) {
		throw new Error("Pass a pay period id as the 2nd arg.");
	}
	const input = await buildPayrollInput(ORG, EMP, PERIOD);
	const allowances = input.payItems.allowances.map((a) => ({
		title: a.title,
		isTaxable: a.isTaxable,
		overrideAmount: a.overrideAmount,
	}));
	const result = calculatePayroll(input);
	const allowanceLines = result.lineItems
		.filter((l) => l.category === "Allowance")
		.map((l) => ({ title: l.title, amount: l.amount, taxable: l.isTaxable }));
	process.stdout.write(
		`${JSON.stringify(
			{
				employee: EMP,
				wageType: input.contract.wageType,
				inputAllowances: allowances,
				engineAllowanceLines: allowanceLines,
				taxableAllowances: result.taxableAllowances,
				grossPay: result.grossPay,
				taxableGross: result.taxableGross,
				netPay: result.netPay,
			},
			null,
			2
		)}\n`
	);
	process.exit(0);
}

main().catch((e) => {
	process.stderr.write(`verify-allowance-applied failed: ${e}\n`);
	process.exit(1);
});
