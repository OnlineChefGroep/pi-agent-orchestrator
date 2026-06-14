import { describe, expect, it } from "vitest";
import { findAgentFile } from "../src/ui/agent-file-helpers.js";

describe("findAgentFile", () => {
  it("prevents path traversal characters", () => {
    expect(findAgentFile("../test")).toBeUndefined();
    expect(findAgentFile("test/../test")).toBeUndefined();
    expect(findAgentFile("..\\test")).toBeUndefined();
    expect(findAgentFile("/absolute/path")).toBeUndefined();
  });
});
