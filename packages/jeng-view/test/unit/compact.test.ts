import { describe, expect, test } from "bun:test";

import { compact } from "../../src/compact";

describe("compact", () => {
    test("shortens a count that overflows a thousand", () => {
        expect(compact(1500)).toBe("1.5k");
    });

    test("keeps a count below a thousand as it was counted", () => {
        expect(compact(999)).toBe("999");
    });
});
