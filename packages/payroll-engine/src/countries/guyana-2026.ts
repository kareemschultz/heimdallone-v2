import { minCents, percentOfCents } from "../money";
import type { CountryPayrollProfileInput, CountryRules } from "../types";

export const guyana2026: CountryRules = {
	countryCode: "GY",
	effectiveYear: 2026,

	computeNIS(grossPay, profile) {
		const ceiling = profile.nisMaxEarnings;
		const nisBase = Math.min(grossPay, ceiling);
		const employee = percentOfCents(nisBase, profile.employeeNISRate);
		const employer = percentOfCents(nisBase, profile.employerNISRate);
		return { employee, employer };
	},

	computePersonalAllowance(grossPay, profile) {
		const threshold = profile.personalAllowanceThreshold;
		const oneThird = Math.round(grossPay / 3);
		return Math.max(threshold, oneThird);
	},

	computeChildAllowance(dependentChildren, profile) {
		return profile.childAllowancePerChild * dependentChildren;
	},

	computePAYE(taxableGross, profile) {
		if (taxableGross <= 0) {
			return 0;
		}
		let tax = 0;
		let remaining = taxableGross;
		for (const bracket of profile.taxBrackets) {
			if (remaining <= 0) {
				break;
			}
			const bracketWidth =
				bracket.max === null ? remaining : bracket.max - bracket.min;
			const taxableInBracket = Math.min(remaining, bracketWidth);
			tax +=
				bracket.fixedAmount + percentOfCents(taxableInBracket, bracket.rate);
			remaining -= taxableInBracket;
		}
		return tax;
	},

	splitOvertimeTaxability(totalOTPay, profile) {
		const cap = profile.overtimeAllowanceCap;
		const nonTaxable = Math.min(totalOTPay, cap);
		const taxable = Math.max(0, totalOTPay - cap);
		return { taxable, nonTaxable };
	},

	computeInsuranceCap(
		premium: number,
		grossPay: number,
		profile: CountryPayrollProfileInput
	) {
		const tenPercentGross = percentOfCents(grossPay, 0.1);
		const statutoryCap = profile.insurancePremiumCapAmount;
		return minCents(premium, minCents(tenPercentGross, statutoryCap));
	},
};
