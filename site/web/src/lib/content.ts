export type DocLink = {
  title: string;
  href: string;
  description: string;
  category: "core" | "operations" | "repo";
};

export const docLinks: DocLink[] = [
  {
    title: "README",
    href: "/docs/README.md",
    description: "Installation, quick start, and feature overview",
    category: "repo",
  },
  {
    title: "Architecture",
    href: "/docs/architecture.md",
    description: "System topology, data flow, and permission model",
    category: "core",
  },
  {
    title: "API reference",
    href: "/docs/api-reference.md",
    description: "Settings schema, tools, hooks, and CLI commands",
    category: "core",
  },
  {
    title: "Custom agents",
    href: "/docs/custom-agents.md",
    description: "Markdown frontmatter format and handoff protocol",
    category: "core",
  },
  {
    title: "Troubleshooting",
    href: "/docs/troubleshooting.md",
    description: "Common issues, diagnostics, and environment checks",
    category: "core",
  },
  {
    title: "Performance",
    href: "/docs/PERFORMANCE.md",
    description: "Benchmarks, spawn latency, and compaction efficiency",
    category: "operations",
  },
  {
    title: "How-To: Performance",
    href: "/docs/HOWTO-perf.md",
    description: "Profiling steps, thresholds, and CI interpretation",
    category: "operations",
  },
  {
    title: "Overdrive patterns",
    href: "/docs/overdrive-patterns.md",
    description: "Optimization patterns and linter rules",
    category: "operations",
  },
  {
    title: "Repository index",
    href: "/docs/repository.md",
    description: "Repository structure overview",
    category: "repo",
  },
  {
    title: "AGENTS.md",
    href: "/docs/AGENTS.md",
    description: "Repository invariants for coding agents",
    category: "repo",
  },
  {
    title: "llms.txt",
    href: "/docs/llms.txt",
    description: "Compact LLM discovery index",
    category: "repo",
  },
  {
    title: "llms-full.txt",
    href: "/docs/llms-full.txt",
    description: "Expanded model context bundle",
    category: "repo",
  },
];

export type Capability = {
  title: string;
  description: string;
  badge?: string;
};

export const capabilities: Capability[] = [
  {
    title: "Sub-agents",
    description:
      "Explore, Plan, Analysis, general-purpose, and custom agent definitions with inherited permissions.",
    badge: "Core",
  },
  {
    title: "Structured handoffs",
    description:
      "Machine-readable transfers with status, evidence, decisions, and remaining work.",
    badge: "Workflow",
  },
  {
    title: "Swarm coordination",
    description: "Dynamic join and leave behavior with live fleet status and bounded concurrency.",
    badge: "Fleet",
  },
  {
    title: "Scheduling",
    description: "Persistent recurring jobs and a dedicated daemon schedule view.",
    badge: "Ops",
  },
  {
    title: "Prompt compression",
    description: "Minimal, balanced, and aggressive policies with global and per-agent controls.",
    badge: "Tokens",
  },
  {
    title: "TUI observability",
    description: "Responsive list, resource top, schedule, performance, help, and settings views.",
    badge: "Dashboard",
  },
];
