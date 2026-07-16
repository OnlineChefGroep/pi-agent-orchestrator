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

export type ShowcasePipeline = "remotion" | "programmatic" | "tmux" | "live" | "vhs";

export type ShowcaseMedium = {
  id: string;
  title: string;
  description: string;
  href: string;
  kind: "video" | "image" | "gif";
  pipeline: ShowcasePipeline;
  featured?: boolean;
};

export const showcasePipelines: Array<{
  id: ShowcasePipeline;
  label: string;
  summary: string;
  command: string;
}> = [
  {
    id: "remotion",
    label: "Remotion",
    summary: "Source-derived promo suite: terminal hero, feature tour, architecture stills, and social cards.",
    command: "npm run showcase:remotion",
  },
  {
    id: "programmatic",
    label: "Programmatic",
    summary: "CI-safe casts from compiled dashboard, top, and widget renderers — no external recorder deps.",
    command: "npm run showcase:ci",
  },
  {
    id: "tmux",
    label: "Tmux",
    summary: "Full scripted terminal session with scene labels and compressed MP4 output.",
    command: "npm run showcase:tmux",
  },
  {
    id: "live",
    label: "Live",
    summary: "Stdout playback captured with asciinema from the live demo script.",
    command: "npm run showcase:live",
  },
  {
    id: "vhs",
    label: "VHS",
    summary: "Declarative Charmbracelet tape for stylized install-and-agents recordings.",
    command: "npm run showcase:vhs",
  },
];

/** Paths are relative to /assets — optional files are hidden in the UI when absent. */
export const showcaseMedia: ShowcaseMedium[] = [
  {
    id: "feature-tour",
    title: "Feature tour",
    description: "Animated tour of capabilities, agent types, and compression levels from repo metadata.",
    href: "/assets/feature_tour.mp4",
    kind: "video",
    pipeline: "remotion",
    featured: true,
  },
  {
    id: "architecture-remotion",
    title: "Architecture overview (Remotion)",
    description: "Source-derived ASCII architecture diagram rendered as a shareable still.",
    href: "/assets/architecture_overview.png",
    kind: "image",
    pipeline: "remotion",
  },
  {
    id: "social-card",
    title: "Social preview card",
    description: "Open Graph / Twitter card still generated from package metadata.",
    href: "/assets/social_preview.png",
    kind: "image",
    pipeline: "remotion",
  },
  {
    id: "promo-banner",
    title: "Promo banner",
    description: "Wide banner for README embeds and release posts.",
    href: "/assets/promo_banner.png",
    kind: "image",
    pipeline: "remotion",
  },
  {
    id: "tmux-session",
    title: "Tmux session recording",
    description: "Seven-scene dashboard tour with calm pacing and title overlays.",
    href: "/assets/showcase_tmux.mp4",
    kind: "video",
    pipeline: "tmux",
  },
  {
    id: "tmux-gif",
    title: "Tmux GIF",
    description: "Looping GIF variant of the tmux capture.",
    href: "/assets/showcase_tmux.gif",
    kind: "gif",
    pipeline: "tmux",
  },
  {
    id: "live-demo",
    title: "Live stdout capture",
    description: "Scripted live demo recorded via asciinema.",
    href: "/assets/showcase_live.mp4",
    kind: "video",
    pipeline: "live",
  },
  {
    id: "programmatic-dashboard",
    title: "Programmatic dashboard",
    description: "Deterministic dashboard cast for CI and fast README refreshes.",
    href: "/assets/showcase_dashboard.gif",
    kind: "gif",
    pipeline: "programmatic",
  },
  {
    id: "programmatic-top",
    title: "Programmatic top view",
    description: "Resource top table renderer capture.",
    href: "/assets/showcase_top_view.gif",
    kind: "gif",
    pipeline: "programmatic",
  },
  {
    id: "programmatic-widget",
    title: "Programmatic widget",
    description: "Compact batch widget renderer capture.",
    href: "/assets/showcase_widget.gif",
    kind: "gif",
    pipeline: "programmatic",
  },
  {
    id: "vhs-tape",
    title: "VHS install tape",
    description: "Declarative terminal recording of build + agents flow.",
    href: "/assets/showcase_vhs.mp4",
    kind: "video",
    pipeline: "vhs",
  },
];

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
