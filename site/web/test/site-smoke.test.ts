import { describe, expect, it } from "vitest";

import { CANONICAL_BASE_URL, canonicalUrl } from "@/lib/site";
import { docLinks } from "@/lib/content";

describe("site constants", () => {
  it("uses the orchestrator canonical base URL", () => {
    expect(CANONICAL_BASE_URL).toBe("https://orchestrator.chefgroep.online");
    expect(canonicalUrl("/install")).toBe("https://orchestrator.chefgroep.online/install");
  });

  it("lists documentation links for the docs index", () => {
    expect(docLinks.length).toBeGreaterThan(5);
    expect(docLinks.every((doc) => doc.href.startsWith("/docs/"))).toBe(true);
  });
});
