import { Card, CardContent } from "@/components/ui/card";
import { siteAssetUrl } from "@/lib/site";

export function TerminalShowcase() {
  const poster = siteAssetUrl("/assets/dashboard_preview.gif");
  const video = siteAssetUrl("/assets/dashboard_preview.mp4");

  return (
    <Card className="overflow-hidden border-border/80 bg-[#080a0d] shadow-[0_42px_110px_rgba(0,0,0,0.52)]">
      <div className="flex h-12 items-center border-b border-border/80 bg-linear-to-b from-[#1a1d23] to-[#121419] px-4 font-mono text-xs text-muted-foreground">
        <div className="mr-4 flex gap-2">
          <span className="size-2.5 rounded-full bg-[#70747d]" />
          <span className="size-2.5 rounded-full bg-[#70747d]" />
          <span className="size-2.5 rounded-full bg-[#70747d]" />
        </div>
        pi — /agents
      </div>
      <CardContent className="p-0">
        <video
          controls
          preload="metadata"
          poster={poster}
          aria-label="Pi Agent Orchestrator terminal dashboard walkthrough"
          className="block aspect-video w-full bg-[#080a0d]"
        >
          <source src={video} type="video/mp4" />
          Your browser does not support embedded MP4 video. Open the{" "}
          <a href={video} className="text-accent underline">
            direct video file
          </a>
          .
        </video>
      </CardContent>
    </Card>
  );
}
