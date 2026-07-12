import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NPM_PACKAGE } from "@/lib/site";

const globalInstall = `pi install npm:${NPM_PACKAGE}`;

const localInstall = `pi install npm:${NPM_PACKAGE} -l`;

const dashboardCommand = "/agents";

export function InstallPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
      <div className="flex flex-col gap-4">
        <Badge variant="outline" className="w-fit border-accent/40 text-accent">
          Installation
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Install Pi Agent Orchestrator</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Add the extension to an existing Pi coding-agent host, then open the fleet dashboard from
          any session.
        </p>
      </div>

      <Separator className="my-10" />

      <Tabs defaultValue="global" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="global">Global install</TabsTrigger>
          <TabsTrigger value="local">Project-local</TabsTrigger>
          <TabsTrigger value="dashboard">Open dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Install globally into Pi</CardTitle>
              <CardDescription>
                Makes the orchestrator available across Pi sessions on this machine.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg border border-border/80 bg-[#080a0d] p-5 font-mono text-sm leading-7 text-[#dfe4e8]">
                {globalInstall}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="local">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Install for the current project</CardTitle>
              <CardDescription>
                Scopes the extension to the active workspace only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg border border-border/80 bg-[#080a0d] p-5 font-mono text-sm leading-7 text-[#dfe4e8]">
                {localInstall}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Open the orchestrator dashboard</CardTitle>
              <CardDescription>
                After installation, start Pi and run the dashboard command from the prompt.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <pre className="overflow-x-auto rounded-lg border border-border/80 bg-[#080a0d] p-5 font-mono text-sm leading-7 text-[#dfe4e8]">
                {dashboardCommand}
              </pre>
              <p className="text-sm text-muted-foreground">
                Use <code className="rounded bg-secondary px-1.5 py-0.5">j</code>/
                <code className="rounded bg-secondary px-1.5 py-0.5">k</code> to navigate agents,
                <code className="rounded bg-secondary px-1.5 py-0.5"> t</code> for the resource top
                view, and <code className="rounded bg-secondary px-1.5 py-0.5">?</code> for help.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator className="my-10" />

      <Card className="border-border/80 bg-card/80">
        <CardHeader>
          <CardTitle>Prerequisites</CardTitle>
          <CardDescription>Verify the host environment before installing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            A working Pi host with{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">
              @earendil-works/pi-coding-agent
            </code>
            .
          </p>
          <p>
            npm registry access for{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">{NPM_PACKAGE}</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
