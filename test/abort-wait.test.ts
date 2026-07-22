import { describe, expect, it } from "vitest";
import { createAbortError, isAbortError, waitForPromiseOrAbort } from "../src/abort-wait.js";

describe("abort-wait", () => {
  it("isAbortError recognizes createAbortError() (DOMException AbortError)", () => {
    const controller = new AbortController();
    controller.abort();
    const error = createAbortError(controller.signal, "wait aborted");
    expect(error.name).toBe("AbortError");
    expect(isAbortError(error)).toBe(true);
  });

  it("isAbortError rejects unrelated errors", () => {
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(new TypeError("nope"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it("waitForPromiseOrAbort returns the resolved value", async () => {
    await expect(waitForPromiseOrAbort(Promise.resolve(42))).resolves.toBe(42);
  });

  it("waitForPromiseOrAbort rejects with AbortError when signal aborts first", async () => {
    const controller = new AbortController();
    const forever = new Promise<number>(() => {});
    const wait = waitForPromiseOrAbort(forever, controller.signal, "cancelled");
    controller.abort();
    await expect(wait).rejects.toMatchObject({ name: "AbortError" });
  });
});
