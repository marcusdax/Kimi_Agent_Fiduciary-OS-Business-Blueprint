import { stages, type Stage } from "./workflow";
export type SavedAction = {
  id: string;
  title: string;
  outcome: string;
  owner: string;
  source: string;
  assumptions: string;
  alternatives: string;
  costs: string;
  stage: Stage;
  version: number;
  authorizedVersion: number | null;
  reviewDate: string | null;
  completionEvidence: string | null;
  events: {
    id: string;
    actorId: string;
    type: string;
    version: number;
    details: string;
    createdAt: string;
  }[];
};
export type ActionFields = Pick<
  SavedAction,
  | "title"
  | "outcome"
  | "owner"
  | "source"
  | "assumptions"
  | "alternatives"
  | "costs"
>;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  token: string | null,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || "/api/v1"}${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
  } catch {
    throw new ApiError(
      0,
      method === "GET"
        ? "The API could not be reached. Reload saved actions when the connection is restored."
        : "The response was lost; the change may have been saved. Reload saved actions before retrying.",
      method !== "GET",
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      method === "GET"
        ? "The planning API did not return JSON. Confirm the backend and proxy configuration."
        : "The API response could not be read; the change may have been saved. Reload saved actions before retrying.",
      method !== "GET",
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload && typeof payload.error === "string"
        ? payload.error
        : "The planning request failed. No change has been confirmed.",
      method !== "GET" && response.status >= 500,
    );
  return payload as T;
}

export function savedAction(value: unknown): SavedAction {
  const a = value as SavedAction | null;
  if (
    !a ||
    typeof a.id !== "string" ||
    !stages.includes(a.stage) ||
    !Number.isInteger(a.version) ||
    !Array.isArray(a.events) ||
    [
      a.title,
      a.outcome,
      a.owner,
      a.source,
      a.assumptions,
      a.alternatives,
      a.costs,
    ].some((v) => typeof v !== "string") ||
    a.events.some(
      (e) =>
        !e ||
        typeof e.details !== "string" ||
        typeof e.createdAt !== "string" ||
        typeof e.actorId !== "string" ||
        typeof e.type !== "string",
    )
  )
    throw new Error(
      "The API returned an invalid planning record. No local change was applied.",
    );
  return a;
}
export function eventDetails(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
