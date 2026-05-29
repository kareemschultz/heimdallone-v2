#!/usr/bin/env bun
/**
 * audit-permissions.ts
 *
 * Guards against the `posting:update` class of bug (caught only by live
 * browser verification in Phase 9D): an oRPC procedure required an
 * access-control action that the permission `statement` never defined, so
 * every role got a 403 and the operation was impossible for everyone.
 *
 * This script scans every router for `authorizedProcedure("resource",
 * "action")` and fails if any (resource, action) is not defined in the
 * access-control statement in packages/auth/src/permissions.ts. Run it as
 * part of QA before a module is considered done:
 *
 *   bun scripts/audit-permissions.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statement } from "../packages/auth/src/permissions";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTERS_DIR = join(ROOT, "packages/api/src/routers");

// Matches authorizedProcedure("resource", "action") with literal strings.
const CALL_RE = /authorizedProcedure\(\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"\s*\)/g;

const validActions = statement as Record<string, readonly string[]>;

interface Finding {
	action: string;
	file: string;
	reason: string;
	resource: string;
}

const findings: Finding[] = [];
const seen = new Set<string>();

const routerFiles = readdirSync(ROUTERS_DIR).filter((f) => f.endsWith(".ts"));

for (const file of routerFiles) {
	const text = readFileSync(join(ROUTERS_DIR, file), "utf8");
	CALL_RE.lastIndex = 0;
	let match: RegExpExecArray | null = CALL_RE.exec(text);
	while (match !== null) {
		const [, resource, action] = match;
		const key = `${resource}:${action}`;
		seen.add(key);
		const actions = validActions[resource];
		if (!actions) {
			findings.push({
				file,
				resource,
				action,
				reason: `resource "${resource}" is not defined in the access-control statement`,
			});
		} else if (!actions.includes(action)) {
			findings.push({
				file,
				resource,
				action,
				reason: `action "${action}" is not defined for resource "${resource}" (valid: ${actions.join(", ")})`,
			});
		}
		match = CALL_RE.exec(text);
	}
}

if (findings.length > 0) {
	process.stderr.write(
		"\n❌ Permission audit FAILED — procedures require actions the statement does not grant:\n\n"
	);
	for (const f of findings) {
		process.stderr.write(
			`  ${f.file}: authorizedProcedure("${f.resource}", "${f.action}")\n`
		);
		process.stderr.write(`    → ${f.reason}\n`);
	}
	process.stderr.write(
		"\nFix: add the missing action(s) to the relevant resource in packages/auth/src/permissions.ts\n(both the `statement` and the managing-role grants), then re-run.\n\n"
	);
	process.exit(1);
}

process.stdout.write(
	`✓ Permission audit passed — all ${seen.size} distinct (resource, action) pairs used by ${routerFiles.length} routers are defined in the access-control statement.\n`
);
