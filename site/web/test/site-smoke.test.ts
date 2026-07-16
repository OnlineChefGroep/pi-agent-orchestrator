import { describe, expect, it } from "vitest";

import { CANONICAL_BASE_URL, canonicalUrl } from "@/lib/site";
import { docLinks, showcaseMedia, showcasePipelines } from "@/lib/content";
import { docSourceIds, docSources } from "@/lib/doc-sources";

describe("site constants", () => {
  it("uses the orchestrator canonical base URL", () => {
    expect(CANONICAL_BASE_URL).toBe("https://orchestrator.chefgroep.online");
    expect(canonicalUrl("/install")).toBe("https://orchestrator.chefgroep.online/install");
    expect(canonicalUrl("/showcase")).toBe("https://orchestrator.chefgroep.online/showcase");
  });

  it("lists documentation links for the docs index", () => {
    expect(docLinks.length).toBeGreaterThan(5);
    expect(docLinks.every((doc) => doc.href.startsWith("/docs/") && !doc.href.endsWith(".md"))).toBe(true);
    expect(docLinks.every((doc) => docSources[doc.docId])).toBe(true);
  });

  it("bundles every doc link into build-time sources", () => {
    for (const id of docSourceIds) {
      expect(docSources[id]?.markdown.length).toBeGreaterThan(20);
    }
  });

  it("declares showcase pipelines and media entries", () => {
    expect(showcasePipelines.length).toBe(5);
    expect(showcaseMedia.some((item) => item.featured)).toBe(true);
    expect(showcaseMedia.every((item) => item.href.startsWith("/assets/"))).toBe(true);
  });
});
