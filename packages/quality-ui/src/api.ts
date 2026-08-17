import type {
  ConfigurationData,
  DashboardData,
  FindingsResponse,
  HistoryResponse,
  QualityEnvironment,
  ReleaseComparison,
  TestDefinition,
  TestRun,
  TestType,
  WallboardData,
} from "./types";

export class QualityApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "QualityApiError";
  }
}

interface ErrorPayload {
  message?: string;
  code?: string;
  error?: { message?: string; code?: string };
}

export interface QualityApiOptions {
  defaultHeaders?: Record<string, string>;
}

export interface HistoryFilters {
  status?: string;
  environment?: string;
  testType?: string;
  page?: number;
}

export interface QualityApi {
  dashboard(environment: QualityEnvironment, signal?: AbortSignal): Promise<DashboardData>;
  catalog(signal?: AbortSignal): Promise<TestDefinition[]>;
  createRun(testType: TestType, environment: QualityEnvironment, idempotencyKey: string): Promise<TestRun>;
  cancelRun(id: string): Promise<TestRun>;
  runs(filters?: HistoryFilters, signal?: AbortSignal): Promise<HistoryResponse>;
  run(id: string, signal?: AbortSignal): Promise<TestRun>;
  findings(signal?: AbortSignal): Promise<FindingsResponse>;
  releases(signal?: AbortSignal): Promise<ReleaseComparison>;
  configuration(signal?: AbortSignal): Promise<ConfigurationData>;
  wallboard(signal?: AbortSignal, etag?: string): Promise<{ data: WallboardData; etag?: string; unchanged: boolean }>;
}

function params(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== "") query.set(key, String(value));
  const result = query.toString();
  return result ? `?${result}` : "";
}

function withSignal(signal?: AbortSignal): RequestInit {
  return signal === undefined ? {} : { signal };
}

function withRunResult(run: TestRun & { result?: { metrics?: Record<string, number>; recommendations?: string[] } | null }): TestRun {
  const durationMs = run.startedAt && run.completedAt ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime() : undefined;
  const result = run.result;
  const metrics = result?.metrics === undefined ? undefined : Object.entries(result.metrics).map(([key, value]) => ({
    label: key.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase()),
    value: key.toLowerCase().includes("rate") ? `${value.toFixed(2)}%` : key.toLowerCase().includes("ms") ? `${value} ms` : value.toLocaleString(),
  }));
  return {
    ...run,
    ...(durationMs === undefined ? {} : { duration: durationMs < 60_000 ? `${Math.max(1, Math.round(durationMs / 1000))} sec` : `${Math.round(durationMs / 60_000)} min` }),
    ...(metrics === undefined ? {} : { metrics }),
    ...(result?.recommendations?.[0] === undefined ? {} : { summary: result.recommendations[0] }),
  };
}

export function createQualityApi(baseUrl = "/api/quality", fetcher: typeof fetch = fetch, options: QualityApiOptions = {}): QualityApi {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`${baseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: { Accept: "application/json", ...options.defaultHeaders, ...init.headers },
    });
    if (!response.ok) {
      let payload: ErrorPayload = {};
      try { payload = (await response.json()) as ErrorPayload; } catch { /* use status text */ }
      throw new QualityApiError(payload.error?.message ?? payload.message ?? response.statusText ?? "Request failed", response.status, payload.error?.code ?? payload.code);
    }
    const payload = await response.json() as T | { data: T };
    return typeof payload === "object" && payload !== null && "data" in payload ? payload.data : payload;
  }

  return {
    dashboard: (environment, signal) => request(`/dashboard${params({ environment })}`, withSignal(signal)),
    catalog: (signal) => request<TestDefinition[]>("/catalog", withSignal(signal)),
    createRun: (testType, environment, idempotencyKey) => request<TestRun>("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ testType, environment }),
    }),
    cancelRun: (id) => request<TestRun>(`/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
    runs: (filters = {}, signal) => request<HistoryResponse>(`/runs${params({ status: filters.status, environment: filters.environment, testType: filters.testType, page: filters.page })}`, withSignal(signal)),
    run: async (id, signal) => {
      const detail = await request<TestRun & { result?: { metrics?: Record<string, number>; recommendations?: string[] } | null }>(`/runs/${encodeURIComponent(id)}`, withSignal(signal));
      return withRunResult(detail);
    },
    findings: (signal) => request<FindingsResponse>("/findings", withSignal(signal)),
    releases: (signal) => request<ReleaseComparison>("/release-comparison", withSignal(signal)),
    configuration: (signal) => request("/configuration", withSignal(signal)),
    wallboard: async (signal, etag) => {
      const response = await fetcher(`${baseUrl}/wallboard`, {
        credentials: "include",
        ...withSignal(signal),
        headers: { Accept: "application/json", ...options.defaultHeaders, ...(etag ? { "If-None-Match": etag } : {}) },
      });
      if (response.status === 304) return { data: undefined as unknown as WallboardData, ...(etag === undefined ? {} : { etag }), unchanged: true };
      if (!response.ok) throw new QualityApiError(response.statusText || "Wallboard unavailable", response.status);
      const nextEtag = response.headers.get("ETag") ?? undefined;
      const payload = await response.json() as WallboardData | { data: WallboardData };
      const data = typeof payload === "object" && payload !== null && "data" in payload ? payload.data : payload;
      return { data, ...(nextEtag ? { etag: nextEtag } : {}), unchanged: false };
    },
  };
}
