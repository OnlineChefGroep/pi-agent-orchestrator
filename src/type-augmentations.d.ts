/**
 * Keep UI activity tracking and optional RPC cleanup hooks typed when a stale
 * PR branch is merged against newer base commits in pull_request CI.
 */
declare module "./ui/agent-ui-types.js" {
  interface AgentActivity {
    lastSeenMs?: number;
  }
}

declare module "./cross-extension-rpc.js" {
  interface RpcDeps {
    swarmCoordinator?: unknown;
  }

  interface RpcHandle {
    unsubSwarmHealth?: () => void;
  }
}

export {};
