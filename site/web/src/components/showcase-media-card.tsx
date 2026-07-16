import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShowcaseMedium } from "@/lib/content";
import { siteAssetUrl } from "@/lib/site";

async function assetExists(path: string): Promise<boolean> {
  try {
    const response = await fetch(siteAssetUrl(path), { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export function ShowcaseMediaCard({ item }: { item: ShowcaseMedium }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const src = siteAssetUrl(item.href);

  useEffect(() => {
    let cancelled = false;
    void assetExists(item.href).then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [item.href]);

  if (available === false) return null;
  if (available === null) {
    return (
      <Card className="border-border/80 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">{item.title}</CardTitle>
          <CardDescription>Checking asset…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 bg-card/80">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{item.title}</CardTitle>
          <Badge variant="secondary" className="font-mono text-[11px] uppercase tracking-wide">
            {item.pipeline}
          </Badge>
        </div>
        <CardDescription>{item.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-0 pb-4">
        {item.kind === "video" ? (
          <video controls preload="metadata" className="aspect-video w-full bg-[#080a0d]" src={src}>
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={src}
            alt={item.title}
            loading="lazy"
            className="block w-full bg-[#080a0d] object-contain"
          />
        )}
        <div className="px-6">
          <Button asChild variant="outline" size="sm">
            <a href={src} download>
              Download
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
