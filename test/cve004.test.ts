import { describe, expect, test } from "vitest";
import { buildValidatorPrompt } from "../src/validators.js";

describe("CVE-004: input type checking", () => {
    test("does not crash or DOS on array input", () => {
        const fakeStr = Array(100000).fill("a");
        expect(() => {
            // @ts-expect-error forcing bad input type
            buildValidatorPrompt(fakeStr, ["criterion"], "desc");
        }).not.toThrow();
    });
});
