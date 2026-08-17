import { randomUUID } from "node:crypto";
import { getCatalogProjection, getDefinition, TEST_CATALOG_VERSION } from "./catalog.js";
import { ApiError } from "./errors.js";
import { assertRunTransition, capabilitiesForRole, evaluateTestExecutionPolicy, getTestDefinition, roleHasCapability } from "@mumsio/quality-domain";
import type {
  ActorContext,
  Capability,
  Finding,
  HealthSnapshot,
  QualityEnvironment,
  QualityServerOptions,
  RunStatus,
  TestResult,
  TestRun,
  TestType,
} from "./model.js";

const terminal = new Set<RunStatus>(["passed", "warning", "failed", "cancelled"]);
export class QualityService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly controllers = new Map<string, AbortController>();
  private createLock: Promise<void> = Promise.resolve();

  constructor(private readonly options: QualityServerOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
  }

  capabilities(actor: ActorContext) {
    const capabilities = [...capabilitiesForRole(actor.role)];
    return { view: capabilities.includes("quality:view"), run: capabilities.includes("quality:run"), configure: capabilities.includes("quality:configure"), wallboardView: capabilities.includes("quality:wallboard:view") };
  }

  require(actor: ActorContext, capability: Capability): void {
    if (!roleHasCapability(actor.role, capability)) throw new ApiError(403, "forbidden", "You do not have permission to perform this action.");
  }

  catalog(actor: ActorContext) {
    this.require(actor, "quality:view");
    return getCatalogProjection().map((item) => ({ testType: item.type, name: item.title, description: item.description, category: item.category, enabled: item.enabled, allowedEnvironments: item.allowedEnvironments, intensity: item.intensity === "moderate" ? "light" : item.intensity, estimatedDuration: formatDuration(item.timeoutSeconds) }));
  }

  async createRun(actor: ActorContext, request: { testType: TestType; environment: QualityEnvironment }, idempotencyKey: string): Promise<{ run: TestRun; replayed: boolean }> {
    this.require(actor, "quality:run");
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) throw new ApiError(400, "invalid_idempotency_key", "Idempotency-Key must contain 8 to 200 characters.");

    let releaseLock!: () => void;
    const previous = this.createLock;
    this.createLock = new Promise<void>((resolve) => { releaseLock = resolve; });
    await previous;
    try {
      const existing = await this.options.repository.findIdempotentRun(actor.userId, idempotencyKey);
      if (existing !== undefined) {
        if (existing.testType !== request.testType || existing.environment !== request.environment) {
          throw new ApiError(409, "idempotency_conflict", "This Idempotency-Key was already used with a different request.");
        }
        return { run: existing, replayed: true };
      }

      const definition = getDefinition(request.testType);
      const active = await this.options.repository.listRuns({ environment: request.environment, limit: 100 });
      const decision = evaluateTestExecutionPolicy({ actor, definition, environment: request.environment, activeRuns: active.filter((run) => run.status === "queued" || run.status === "running").map((run) => ({ id: run.id, environment: run.environment, intensity: getTestDefinition(run.testType).intensity, status: run.status as "queued" | "running" })) });
      if (!decision.allowed) throw new ApiError(decision.code === "heavy_test_conflict" ? 409 : 403, decision.code, decision.reason);

      const run: TestRun = {
        id: this.idGenerator(),
        testType: request.testType,
        testDefinitionVersion: definition.version,
        policyVersion: decision.policyVersion,
        environment: request.environment,
        status: "queued",
        requestedBy: { id: actor.userId, displayName: actor.displayName },
        requestedRole: actor.role as Extract<ActorContext["role"], "owner" | "admin" | "dev">,
        idempotencyKey,
        createdAt: this.now().toISOString(),
      };
      await this.options.repository.createRun(run);
      await this.options.repository.appendEvent({ runId: run.id, type: "created", actorId: actor.userId, at: run.createdAt });
      queueMicrotask(() => { void this.execute(run.id); });
      return { run, replayed: false };
    } finally {
      releaseLock();
    }
  }

  private async execute(runId: string): Promise<void> {
    const run = await this.options.repository.getRun(runId);
    if (run === undefined || run.status !== "queued") return;
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    assertRunTransition(run.status, "running");
    const started: TestRun = { ...run, status: "running", startedAt: this.now().toISOString() };
    try {
      await this.options.repository.updateRun(started);
      await this.options.repository.appendEvent({ runId, type: "started", at: started.startedAt! });
      const output = await this.options.runner.run(started, controller.signal);
      const current = await this.options.repository.getRun(runId);
      if (current?.status === "cancelled") return;
      await this.options.repository.saveOutput(output);
      const completedAt = this.now().toISOString();
      assertRunTransition(started.status, output.result.status);
      const completed: TestRun = { ...started, status: output.result.status, score: output.result.overallScore, completedAt };
      await this.options.repository.updateRun(completed);
      await this.options.repository.appendEvent({ runId, type: "completed", at: completedAt });
    } catch (error) {
      const current = await this.options.repository.getRun(runId);
      if (current?.status === "cancelled" || (error instanceof Error && error.name === "AbortError")) return;
      const completedAt = this.now().toISOString();
      assertRunTransition(started.status, "failed");
      await this.options.repository.updateRun({ ...started, status: "failed", completedAt, error: { code: "runner_failed", message: "The test runner could not complete this run." } });
      await this.options.repository.appendEvent({ runId, type: "failed", at: completedAt });
    } finally {
      this.controllers.delete(runId);
    }
  }

  async cancelRun(actor: ActorContext, runId: string): Promise<TestRun> {
    this.require(actor, "quality:run");
    const run = await this.getRun(actor, runId);
    if (terminal.has(run.status)) throw new ApiError(409, "run_terminal", "A completed run cannot be cancelled.");
    assertRunTransition(run.status, "cancelled");
    const cancelled: TestRun = { ...run, status: "cancelled", completedAt: this.now().toISOString() };
    await this.options.repository.updateRun(cancelled);
    await this.options.repository.appendEvent({ runId, type: "cancelled", actorId: actor.userId, at: cancelled.completedAt! });
    this.controllers.get(runId)?.abort();
    return cancelled;
  }

  async getRun(actor: ActorContext, id: string): Promise<TestRun> {
    this.require(actor, "quality:view");
    const run = await this.options.repository.getRun(id);
    if (run === undefined) throw new ApiError(404, "run_not_found", "The requested test run was not found.");
    return run;
  }

  async getRunDetail(actor: ActorContext, id: string) {
    const run = await this.getRun(actor, id);
    const [result, events] = await Promise.all([this.options.repository.getResult(id), this.options.repository.listEvents(id)]);
    return { run, result: result ?? null, events };
  }

  async listRuns(actor: ActorContext, filters: { environment?: QualityEnvironment; status?: RunStatus; testType?: TestType; limit?: number }) {
    this.require(actor, "quality:view");
    return this.options.repository.listRuns(filters);
  }

  async result(actor: ActorContext, runId: string) {
    await this.getRun(actor, runId);
    const result = await this.options.repository.getResult(runId);
    if (result === undefined) throw new ApiError(404, "result_not_found", "No result is available for this run.");
    return result;
  }

  async findings(actor: ActorContext, filters: { severity?: Finding["severity"]; state?: Finding["state"] }) {
    this.require(actor, "quality:view");
    return this.options.repository.listFindings(filters);
  }

  async latestHealth(actor: ActorContext) {
    this.require(actor, "quality:view");
    return (await this.options.repository.getLatestHealth()) ?? null;
  }

  async releaseComparison(actor: ActorContext) {
    this.require(actor, "quality:view");
    const completed = (await this.options.repository.listRuns({ limit: 100 })).filter((run) => terminal.has(run.status) && run.status !== "cancelled" && run.score !== undefined);
    const current = completed[0];
    const previous = completed[1];
    if (current === undefined) return null;
    const currentScore = current.score ?? 0;
    const previousScore = previous?.score ?? currentScore;
    return {
      base: { version: previous?.release ?? "previous", date: previous?.completedAt ?? previous?.createdAt ?? current.createdAt, score: previousScore },
      current: { version: current.release ?? "current", date: current.completedAt ?? current.createdAt, score: currentScore },
      metrics: [{ label: "Overall score", base: String(previousScore), current: String(currentScore), change: currentScore - previousScore }],
    };
  }

  async dashboard(actor: ActorContext, environment?: QualityEnvironment) {
    this.require(actor, "quality:view");
    const [health, runs, findings, releaseComparison] = await Promise.all([
      this.options.repository.getLatestHealth(),
      this.options.repository.listRuns({ ...(environment === undefined ? {} : { environment }), limit: 8 }),
      this.options.repository.listFindings({ state: "open" }),
      this.releaseComparison(actor),
    ]);
    const findingCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const finding of findings) findingCounts[finding.severity] += 1;
    const completedScores = runs.filter((run) => run.score !== undefined).map((run) => run.score!).reverse();
    const hasData = health !== undefined;
    const dimensions = hasData ? dimensionViews(health.dimensions) : emptyDimensionViews();
    const systems = systemViews(health?.systems);
    return {
      generatedAt: this.now().toISOString(),
      hasData,
      overallScore: health?.overallScore ?? 0,
      trend: completedScores,
      ...(completedScores.length > 1 ? { scoreChange: completedScores.at(-1)! - completedScores.at(-2)! } : {}),
      dimensions,
      systems,
      ...(runs[0] === undefined ? {} : { latestRun: runView(runs[0]) }),
      recentRuns: runs.map(runView),
      findings: findings.map(findingView),
      ...(releaseComparison === null ? {} : { releaseComparison }),
      alerts: findings.filter((finding) => finding.severity !== "info").slice(0, 3).map((finding) => ({ id: finding.id, title: finding.title, severity: finding.severity === "critical" ? "critical" : "warning", occurredAt: finding.detectedAt })),
      capabilities: this.capabilities(actor),
    };
  }

  configuration(actor: ActorContext) {
    this.require(actor, "quality:view");
    return {
      catalogVersion: TEST_CATALOG_VERSION,
      policyVersion: "1.0.0",
      adapters: Object.entries(this.options.adapterNames ?? { repository: "in-memory", runner: "mock" }).map(([name, value]) => ({ name, value, state: "active" as const })),
      features: [
        { name: "Mock runner", enabled: true, description: "Deterministic standalone execution" },
        { name: "Live connectors", enabled: false, description: "Planned after standalone approval" },
        { name: "Unattended wallboard", enabled: false, description: "Attended authenticated mode only" },
      ],
      capabilities: this.capabilities(actor),
    };
  }

  async wallboard(actor: ActorContext) {
    this.require(actor, "quality:wallboard:view");
    const [health, runs, findings] = await Promise.all([
      this.options.repository.getLatestHealth(),
      this.options.repository.listRuns({ limit: 8 }),
      this.options.repository.listFindings({ state: "open" }),
    ]);
    const generatedAt = this.now().toISOString();
    const freshnessMs = (this.options.wallboardFreshnessSeconds ?? 120) * 1000;
    const stale = health === undefined || this.now().getTime() - new Date(health.capturedAt).getTime() > freshnessMs;
    const findingCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const finding of findings) findingCounts[finding.severity] += 1;
    const active = runs.find((run) => run.status === "queued" || run.status === "running");
    const latest = runs.find((run) => run.status !== "queued" && run.status !== "running");
    return {
      generatedAt,
      stale,
      overallScore: health?.overallScore ?? 0,
      status: health === undefined ? "warning" : health.status === "healthy" ? "passed" : health.status === "critical" ? "failed" : "warning",
      dimensions: health === undefined ? emptyDimensionViews() : dimensionViews(health.dimensions),
      systems: systemViews(health?.systems),
      ...(latest === undefined ? {} : { latestRun: runSummary(latest) }),
      ...(active === undefined ? {} : { activeRun: { ...runSummary(active), progress: active.status === "running" ? 50 : 0 } }),
      openFindings: { critical: findingCounts.critical, high: findingCounts.high, medium: findingCounts.medium, low: findingCounts.low },
    };
  }
}

export function runView(run: TestRun) {
  const definition = getTestDefinition(run.testType);
  return { id: run.id, testType: run.testType, displayName: definition.title, environment: run.environment, status: run.status, ...(run.score === undefined ? {} : { score: run.score }), createdAt: run.createdAt, ...(run.startedAt === undefined ? {} : { startedAt: run.startedAt }), ...(run.completedAt === undefined ? {} : { completedAt: run.completedAt }), ...(run.release === undefined ? {} : { release: run.release }) };
}

export function findingView(finding: Finding) {
  return { id: finding.id, title: finding.title, severity: finding.severity, source: finding.source, system: finding.system, status: finding.state === "accepted" ? "acknowledged" : finding.state, detectedAt: finding.detectedAt };
}

function runSummary(run: TestRun) {
  const view = runView(run);
  return { displayName: view.displayName, environment: view.environment, status: view.status, ...(view.score === undefined ? {} : { score: view.score }), ...(view.completedAt === undefined ? {} : { completedAt: view.completedAt }) };
}

function dimensionViews(dimensions: TestResult["dimensions"]) {
  return Object.entries(dimensions).map(([id, score]) => ({ id, label: id === "releaseQuality" ? "Release Quality" : id.charAt(0).toUpperCase() + id.slice(1), score, status: score >= 90 ? "passed" : score >= 70 ? "warning" : "failed" }));
}

const dimensionCatalog = [
  { id: "performance", label: "Performance" },
  { id: "reliability", label: "Reliability" },
  { id: "security", label: "Security" },
  { id: "efficiency", label: "Efficiency" },
  { id: "releaseQuality", label: "Release Quality" },
] as const;

const systemCatalog = [
  { id: "supabase", name: "Supabase" },
  { id: "railway", name: "Railway" },
  { id: "cloudflare_web", name: "Cloudflare / Web" },
  { id: "mumsio_go_ios", name: "MumsioGo iOS" },
  { id: "mumsio_go_android", name: "MumsioGo Android" },
] as const;

function emptyDimensionViews() {
  return dimensionCatalog.map((dimension) => ({ ...dimension, score: 0, status: "unknown" as const }));
}

function systemViews(systems: HealthSnapshot["systems"] | undefined) {
  return systemCatalog.map((definition) => {
    const system = systems?.find((candidate) => candidate.id === definition.id);
    return system === undefined
      ? { ...definition, status: "unknown" as const }
      : { ...definition, score: system.score, status: system.status === "outage" ? "down" as const : system.status };
  });
}

function formatDuration(seconds: number): string { return seconds >= 3600 ? `${Math.round(seconds / 3600)} hr` : seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} sec`; }
