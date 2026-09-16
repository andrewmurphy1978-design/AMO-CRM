// Client for the Make (Integromat) public REST API v2.
//
// NOTE: this session's network access couldn't reach api.make.com-style
// hosts to confirm the raw REST response envelope, but the field names below
// (id, scenarioId, scenarioName, status, duration, operations, timestamp,
// endedAt) are confirmed against Andrew's own real execution history via the
// Make MCP connector, which wraps this same API — if the raw REST envelope
// key differs slightly (e.g. "logs" vs a bare array), `extractItems` below
// handles the common shapes defensively.
export interface MakeExecution {
  id: string;
  scenarioId: number | null;
  scenarioName: string | null;
  status: "success" | "error";
  operations: number | null;
  durationMs: number | null;
  startedAt: string | null;
  endedAt: string | null;
  raw: Record<string, unknown>;
}

export interface MakeScenario {
  id: number;
  name: string;
  isActive: boolean;
}

export class MakeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MakeApiError";
    this.status = status;
  }
}

export class MakeClient {
  constructor(
    private apiKey: string,
    private zone: string
  ) {}

  private async request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`https://${this.zone}/api/v2${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Token ${this.apiKey}`, Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // Make returns 403 "IM002 Insufficient rights" when the API token
      // itself is valid but wasn't created with the scope a given endpoint
      // needs (e.g. "Scenarios: Read") — a 401 would mean the key is wrong,
      // this means the key is right but under-scoped.
      if (response.status === 403 && text.includes("IM002")) {
        throw new MakeApiError(
          "Make rejected this API key for insufficient permissions (IM002). Edit or recreate the key in Make under Profile → API and make sure \"Scenarios: Read\" is checked, then save it here again.",
          response.status
        );
      }
      throw new MakeApiError(`Make API request to ${path} failed with ${response.status}: ${text.slice(0, 300)}`, response.status);
    }

    return response.json() as Promise<T>;
  }

  async listScenarios(teamId: number): Promise<MakeScenario[]> {
    const data = await this.request<unknown>("/scenarios", { teamId });
    return extractItems(data).map((raw) => ({
      id: Number(raw.id),
      name: String(raw.name ?? ""),
      isActive: Boolean(raw.isActive ?? raw.is_active),
    }));
  }

  async listExecutions(scenarioId: number, limit = 20): Promise<MakeExecution[]> {
    const data = await this.request<unknown>(`/scenarios/${scenarioId}/logs`, {
      "pg[limit]": limit,
      "pg[sortDir]": "desc",
    });
    return extractItems(data).map(mapExecution);
  }

  /** Confirms the API key is valid by requesting the team's scenario list. */
  async verifyApiKey(teamId: number): Promise<boolean> {
    try {
      await this.listScenarios(teamId);
      return true;
    } catch (error) {
      if (error instanceof MakeApiError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      throw error;
    }
  }
}

function extractItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["scenarioLogs", "logs", "scenarios", "items", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return null;
}

function mapExecution(raw: Record<string, unknown>): MakeExecution {
  const status = pick(raw, ["status"]);
  // Confirmed against real data: status 1 = success. Anything else (a
  // different code, or an explicit error field) is treated as a failure
  // rather than assumed successful.
  const isSuccess = status === 1 || status === "1" || status === "success";
  const hasErrorField = Boolean(pick(raw, ["error", "errorMessage"]));

  return {
    id: String(pick(raw, ["id", "imtId"]) ?? ""),
    scenarioId: (() => {
      const v = pick(raw, ["scenarioId"]);
      return v === null ? null : Number(v);
    })(),
    scenarioName: pick(raw, ["scenarioName"]) as string | null,
    status: isSuccess && !hasErrorField ? "success" : "error",
    operations: (() => {
      const v = pick(raw, ["operations"]);
      return v === null ? null : Number(v);
    })(),
    durationMs: (() => {
      const v = pick(raw, ["duration"]);
      return v === null ? null : Number(v);
    })(),
    startedAt: pick(raw, ["timestamp", "startedAt", "started"]) as string | null,
    endedAt: pick(raw, ["endedAt", "finishedAt", "finished"]) as string | null,
    raw,
  };
}
