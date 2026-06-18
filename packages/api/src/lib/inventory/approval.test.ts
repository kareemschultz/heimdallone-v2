/**
 * Unit tests for the separation-of-duties predicate (Phase INV-C).
 * The creator of a stock movement may never approve it (CLAUDE.md non-negotiable).
 */

import { describe, expect, it } from "bun:test";
import { isSelfApproval } from "./approval";

describe("isSelfApproval", () => {
	it("blocks an actor approving a record they created", () => {
		expect(isSelfApproval("user_1", "user_1")).toBe(true);
	});

	it("allows a different approver", () => {
		expect(isSelfApproval("user_2", "user_1")).toBe(false);
	});

	it("matches against any of several originator ids", () => {
		expect(isSelfApproval("user_1", "user_3", "user_1")).toBe(true);
		expect(isSelfApproval("user_9", "user_3", "user_1")).toBe(false);
	});

	it("never matches a null/undefined actor", () => {
		expect(isSelfApproval(null, "user_1")).toBe(false);
		expect(isSelfApproval(undefined, "user_1")).toBe(false);
	});

	it("ignores null/undefined originators", () => {
		expect(isSelfApproval("user_1", null, undefined)).toBe(false);
	});
});
