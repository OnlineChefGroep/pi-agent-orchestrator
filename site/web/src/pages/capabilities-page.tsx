import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { capabilities } from "@/lib/content";

export function CapabilitiesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
      <div className="flex flex-col gap-4">
        <Badge variant="outline" className="w-fit border-accent/40 text-accent">
          Capabilities
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Orchestration primitives</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Control-plane features for bounded, observable multi-agent execution inside the Pi host.
        </p>
      </div>

      <Separator className="my-10" />

      <Tabs defaultValue="overview" className="flex flex-col gap-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard views</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            {capabilities.map((item) => (
              <Card key={item.title} className="border-border/80 bg-card/80">
                <CardHeader className="gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{item.title}</CardTitle>
                    {item.badge ? <Badge variant="secondary">{item.badge}</Badge> : null}
                  </div>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dashboard">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Interactive TUI dashboard</CardTitle>
              <CardDescription>Six primary views for fleet observability and control.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {[
                "Agent list with multi-select and kill actions",
                "Resource top view for live process metrics",
                "Daemon schedule view for recurring jobs",
                "Performance metrics overlay",
                "Help overlay with keyboard cheatsheet",
                "Settings view for compression and motion profiles",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border/80 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground"
                >
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
