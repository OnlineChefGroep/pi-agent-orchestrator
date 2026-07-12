import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const DEFAULT_PARENT_ISSUE = "CHE-100";

const PARENT_QUERY = `
  query ParentIssue($id: String!) {
    issue(id: $id) {
      id
      project { id }
      team {
        id
        states { nodes { id name type } }
      }
      children {
        nodes { id identifier description }
      }
    }
  }
`;

const CREATE_ISSUE = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }
`;

const UPDATE_ISSUE = `
  mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id identifier url }
    }
  }
`;

export function githubMarker(repository, kind, number) {
  return `<!-- github-${kind}:${repository}#${number} -->`;
}

function labelNames(labels = []) {
  return labels
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter(Boolean);
}

export function normalizeGithubEntity(event, repository) {
  if (event.pull_request) {
    const pullRequest = event.pull_request;
    const merged = Boolean(pullRequest.merged || pullRequest.merged_at);
    const stateKey = merged
      ? "done"
      : pullRequest.state === "closed"
        ? "canceled"
        : pullRequest.draft
          ? "in-progress"
          : "in-review";

    return {
      kind: "pr",
      number: pullRequest.number,
      title: `PR #${pullRequest.number}: ${pullRequest.title}`,
      url: pullRequest.html_url,
      author: pullRequest.user?.login ?? "unknown",
      body: pullRequest.body ?? "",
      labels: labelNames(pullRequest.labels),
      stateKey,
      status: merged ? "merged" : pullRequest.state,
      branch: pullRequest.head?.ref ?? "unknown",
      marker: githubMarker(repository, "pr", pullRequest.number),
      updatedAt: pullRequest.updated_at ?? new Date().toISOString(),
    };
  }

  if (event.issue) {
    const issue = event.issue;
    const stateKey =
      issue.state === "closed"
        ? issue.state_reason === "not_planned"
          ? "canceled"
          : "done"
        : "backlog";

    return {
      kind: "issue",
      number: issue.number,
      title: `GitHub issue #${issue.number}: ${issue.title}`,
      url: issue.html_url,
      author: issue.user?.login ?? "unknown",
      body: issue.body ?? "",
      labels: labelNames(issue.labels),
      stateKey,
      status: issue.state,
      branch: null,
      marker: githubMarker(repository, "issue", issue.number),
      updatedAt: issue.updated_at ?? new Date().toISOString(),
    };
  }

  throw new Error("Unsupported GitHub event: expected pull_request or issue payload");
}

export function selectLinearState(states, stateKey) {
  const preferredNames = {
    backlog: ["Backlog", "Triage", "Todo"],
    "in-progress": ["In Progress", "Started"],
    "in-review": ["In Review", "Review"],
    done: ["Done", "Completed"],
    canceled: ["Canceled", "Cancelled"],
  };
  const preferredTypes = {
    backlog: ["backlog", "unstarted"],
    "in-progress": ["started"],
    "in-review": ["started"],
    done: ["completed"],
    canceled: ["canceled", "cancelled"],
  };

  for (const name of preferredNames[stateKey] ?? []) {
    const match = states.find((state) => state.name.toLowerCase() === name.toLowerCase());
    if (match) return match;
  }

  for (const type of preferredTypes[stateKey] ?? []) {
    const match = states.find((state) => state.type.toLowerCase() === type);
    if (match) return match;
  }

  throw new Error(`No Linear workflow state found for ${stateKey}`);
}

export function buildLinearDescription(entity, repository) {
  const labels = entity.labels.length > 0 ? entity.labels.join(", ") : "none";
  const branch = entity.branch ? `\n- Branch: \`${entity.branch}\`` : "";
  const body = entity.body.trim().slice(0, 8000) || "_No description provided._";

  return `${entity.marker}
Auto-synced from [${repository} ${entity.kind} #${entity.number}](${entity.url}).

- GitHub status: **${entity.status}**
- Author: \`${entity.author}\`
- Labels: ${labels}${branch}
- Last GitHub update: ${entity.updatedAt}

## GitHub description

${body}`;
}

async function linearRequest(token, query, variables, fetchImpl = fetch) {
  const response = await fetchImpl(LINEAR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(
      `Linear API request failed (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`,
    );
  }
  return payload.data;
}

export async function syncGithubEvent({
  event,
  repository,
  token,
  parentIssue = DEFAULT_PARENT_ISSUE,
  fetchImpl = fetch,
}) {
  const entity = normalizeGithubEntity(event, repository);
  const parentData = await linearRequest(
    token,
    PARENT_QUERY,
    { id: parentIssue },
    fetchImpl,
  );
  const parent = parentData.issue;
  if (!parent) throw new Error(`Linear parent issue not found: ${parentIssue}`);

  const state = selectLinearState(parent.team.states.nodes, entity.stateKey);
  const description = buildLinearDescription(entity, repository);
  const existing = parent.children.nodes.find((child) =>
    child.description?.includes(entity.marker),
  );

  if (existing) {
    const data = await linearRequest(
      token,
      UPDATE_ISSUE,
      {
        id: existing.id,
        input: {
          title: entity.title,
          description,
          stateId: state.id,
        },
      },
      fetchImpl,
    );
    return { action: "updated", issue: data.issueUpdate.issue };
  }

  const input = {
    teamId: parent.team.id,
    parentId: parent.id,
    stateId: state.id,
    title: entity.title,
    description,
    priority: 3,
  };
  if (parent.project?.id) input.projectId = parent.project.id;

  const data = await linearRequest(token, CREATE_ISSUE, { input }, fetchImpl);
  return { action: "created", issue: data.issueCreate.issue };
}

async function main() {
  const token = process.env.LINEAR_API_KEY;
  if (!token) {
    console.log("::warning::Linear sync skipped because LINEAR_API_KEY is not configured");
    return;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!eventPath || !repository) {
    throw new Error("GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required");
  }

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const result = await syncGithubEvent({
    event,
    repository,
    token,
    parentIssue: process.env.LINEAR_PARENT_ISSUE || DEFAULT_PARENT_ISSUE,
  });

  console.log(`${result.action} Linear issue ${result.issue.identifier}: ${result.issue.url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
