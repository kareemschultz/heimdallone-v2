// biome-ignore-all lint: one-shot tenant mapper (Phase 21B).
//
// v1 `organization` -> v2 `organization`. Better-Auth org tables are shared, so
// this is a near-direct map. Each v1 tenant becomes a v2 organization.

import { coverFields, type Mapper } from "./types-v1";

const KNOWN: Record<string, { v2: string | null; status: any; note?: string }> =
	{
		id: { v2: "id", status: "mapped" },
		name: { v2: "name", status: "mapped" },
		slug: { v2: "slug", status: "mapped" },
		logo: { v2: "logo", status: "mapped" },
		metadata: { v2: "metadata", status: "mapped" },
	};

export const tenantMapper: Mapper = {
	v1Table: "organization",
	v2Target: "organization",
	classification: "direct_map",
	reason: "Better-Auth org -> v2 organization (1 tenant = 1 org)",
	selectSql: 'SELECT * FROM "organization"',
	inspect(rows) {
		const fields = coverFields(rows, KNOWN);
		const unmappable: { id: string; reason: string }[] = [];
		for (const r of rows) {
			if (!r.slug) {
				unmappable.push({
					id: r.id,
					reason: "missing slug (org subdomain key)",
				});
			}
		}
		return {
			fields,
			unmappable,
			notes: [`${rows.length} tenant(s) -> v2 organizations`],
		};
	},
};
