/**
 * Pay-frequency drift guard (CI).
 *
 * The supported pay frequencies are declared in ONE place
 * (@Heimdallone/payroll-engine/pay-frequency · PAY_FREQUENCIES) but re-stated as
 * literals in the Drizzle pg enum (drizzle-kit needs static literals). This script
 * fails if the DB enum and the canonical list ever diverge as a SET — so adding a
 * frequency in only one place can't ship. Run in CI alongside audit:permissions.
 *
 * Usage: bun scripts/verify-pay-frequency.ts
 */
import { contractPayFrequencyEnum } from "../packages/db/src/schema/hr-core";
import {
	PAY_FREQUENCIES,
	PAY_FREQUENCY_META,
} from "../packages/payroll-engine/src/pay-frequency";

const sortedSet = (xs: readonly string[]): string =>
	[...new Set(xs)].sort().join(",");

const canonical = sortedSet(PAY_FREQUENCIES);
const dbEnum = sortedSet(contractPayFrequencyEnum.enumValues);

let failures = 0;
const fail = (msg: string) => {
	failures += 1;
	process.stderr.write(`✗ ${msg}\n`);
};
const ok = (msg: string) => process.stdout.write(`✓ ${msg}\n`);

if (canonical === dbEnum) {
	ok(`DB enum == canonical list (${PAY_FREQUENCIES.length}): ${canonical}`);
} else {
	fail(
		`DB enum drifted from canonical list.\n    canonical: ${canonical}\n    db enum:   ${dbEnum}`
	);
}

// Every canonical value must carry metadata (label + periods) — no UI/math gap.
for (const f of PAY_FREQUENCIES) {
	const meta = PAY_FREQUENCY_META[f];
	if (meta && meta.value === f && meta.periodsPerYear > 0 && meta.label) {
		ok(`metadata present: ${f} (${meta.periodsPerYear}/yr, "${meta.label}")`);
	} else {
		fail(`missing/invalid metadata for "${f}"`);
	}
}

if (failures > 0) {
	process.stderr.write(`\n${failures} pay-frequency check(s) FAILED\n`);
	process.exit(1);
}
process.stdout.write("\nAll pay-frequency checks passed.\n");
