import agentsMd from "../../../../AGENTS.md?raw";
import readmeMd from "../../../../README.md?raw";
import apiReferenceMd from "../../../../docs/api-reference.md?raw";
import architectureMd from "../../../../docs/architecture.md?raw";
import customAgentsMd from "../../../../docs/custom-agents.md?raw";
import howtoPerfMd from "../../../../docs/HOWTO-perf.md?raw";
import performanceMd from "../../../../docs/PERFORMANCE.md?raw";
import overdriveMd from "../../../../docs/overdrive-patterns.md?raw";
import repositoryMd from "../../../../docs/repository.md?raw";
import troubleshootingMd from "../../../../docs/troubleshooting.md?raw";

export type DocSource = {
  title: string;
  markdown: string;
};

/** Bundled at build time — raw markdown never published as static site files. */
export const docSources: Record<string, DocSource> = {
  readme: { title: "README", markdown: readmeMd },
  agents: { title: "AGENTS.md", markdown: agentsMd },
  architecture: { title: "Architecture", markdown: architectureMd },
  "api-reference": { title: "API reference", markdown: apiReferenceMd },
  "custom-agents": { title: "Custom agents", markdown: customAgentsMd },
  troubleshooting: { title: "Troubleshooting", markdown: troubleshootingMd },
  performance: { title: "Performance", markdown: performanceMd },
  "howto-perf": { title: "How-To: Performance", markdown: howtoPerfMd },
  "overdrive-patterns": { title: "Overdrive patterns", markdown: overdriveMd },
  repository: { title: "Repository index", markdown: repositoryMd },
};

export const docSourceIds = Object.keys(docSources);
