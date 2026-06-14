/**
 * Tenant workweek/weekend classifier verification — Phase 21G-E (DB-free).
 *
 * Proves classifyDayType reads the tenant's `weekendDays` + holiday calendar
 * instead of hardcoding Sat/Sun, while staying byte-identical for the default
 * Sat/Sun tenant. The classified bucket drives OT-multiplier selection, so a
 * mis-classified rest day is a money bug for non-Sat/Sun tenants (audit H3).
 *
 * Usage: bun scripts/verify-workweek-classifier.ts
 */

import { classifyDayType } from "../packages/api/src/utils/attendance-recalc";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra = "") {
	if (cond) {
		pass += 1;
		process.stdout.write(`  ✓ ${label}${extra ? ` — ${extra}` : ""}\n`);
	} else {
		fail += 1;
		process.stdout.write(`  ✗ ${label}${extra ? ` — ${extra}` : ""}\n`);
	}
}

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
// Reference dates in June 2026 with their JS getDay() (0 = Sun … 6 = Sat).
const MON = { date: d("2026-06-15"), dow: 1 };
const FRI = { date: d("2026-06-19"), dow: 5 };
const SAT = { date: d("2026-06-20"), dow: 6 };
const SUN = { date: d("2026-06-21"), dow: 0 };

const SAT_SUN = { weekendDays: [6, 7], holidays: [] };

process.stdout.write("\n§1 Default Sat/Sun weekend (unchanged behaviour)\n");
ok(
	"Saturday → saturday",
	classifyDayType(SAT.date, SAT.dow, SAT_SUN) === "saturday"
);
ok("Sunday → sunday", classifyDayType(SUN.date, SUN.dow, SAT_SUN) === "sunday");
ok(
	"Monday → weekday",
	classifyDayType(MON.date, MON.dow, SAT_SUN) === "weekday"
);
ok(
	"Friday → weekday",
	classifyDayType(FRI.date, FRI.dow, SAT_SUN) === "weekday"
);

process.stdout.write("\n§2 Friday/Saturday weekend (Gulf-style tenant)\n");
const FRI_SAT = { weekendDays: [5, 6], holidays: [] };
ok(
	"Friday → saturday (rest-day premium bucket)",
	classifyDayType(FRI.date, FRI.dow, FRI_SAT) === "saturday"
);
ok(
	"Saturday → saturday",
	classifyDayType(SAT.date, SAT.dow, FRI_SAT) === "saturday"
);
ok(
	"Sunday is now a WORKING day → weekday",
	classifyDayType(SUN.date, SUN.dow, FRI_SAT) === "weekday"
);

process.stdout.write("\n§3 Sunday/Monday weekend\n");
const SUN_MON = { weekendDays: [7, 1], holidays: [] };
ok("Sunday → sunday", classifyDayType(SUN.date, SUN.dow, SUN_MON) === "sunday");
ok(
	"Monday → saturday (rest-day premium bucket)",
	classifyDayType(MON.date, MON.dow, SUN_MON) === "saturday"
);
ok(
	"Saturday is now a WORKING day → weekday",
	classifyDayType(SAT.date, SAT.dow, SUN_MON) === "weekday"
);

process.stdout.write("\n§4 Holiday precedence\n");
const holidayMon = {
	weekendDays: [6, 7],
	holidays: [{ startDate: MON.date, endDate: null, isRecurring: false }],
};
ok(
	"holiday on a weekday → holiday",
	classifyDayType(MON.date, MON.dow, holidayMon) === "holiday"
);
const holidaySat = {
	weekendDays: [6, 7],
	holidays: [{ startDate: SAT.date, endDate: null, isRecurring: false }],
};
ok(
	"holiday wins over weekend",
	classifyDayType(SAT.date, SAT.dow, holidaySat) === "holiday"
);
const recurring = {
	weekendDays: [6, 7],
	holidays: [{ startDate: d("2020-06-15"), endDate: null, isRecurring: true }],
};
ok(
	"recurring holiday matches across years",
	classifyDayType(MON.date, MON.dow, recurring) === "holiday"
);

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
