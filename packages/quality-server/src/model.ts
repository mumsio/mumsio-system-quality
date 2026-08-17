import type { ActorContext, AdminRole, Environment, RunStatus, TestType, ViewerCapability } from "@mumsio/quality-contracts";
export { ENVIRONMENTS as environments, TEST_TYPES as testTypes } from "@mumsio/quality-contracts";
export type { ActorContext, RunStatus, TestType } from "@mumsio/quality-contracts";
export type QualityEnvironment = Environment;
export type ActorRole = AdminRole;
export type Capability = ViewerCapability;

export interface TestRun {
  id: string;
  testType: TestType;
  testDefinitionVersion: string;
  policyVersion: string;
  environment: QualityEnvironment;
  status: RunStatus;
  requestedBy: { id: string; displayName: string };
  requestedRole: Extract<AdminRole, "owner" | "admin" | "dev">;
  idempotencyKey: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  release?: string;
  score?: number;
  error?: { code: string; message: string };
}

export interface TestResult {
  id: string;
  runId: string;
  overallScore: number;
  status: Extract<RunStatus, "passed" | "warning" | "failed">;
  dimensions: Record<"performance" | "reliability" | "security" | "efficiency" | "releaseQuality", number>;
  metrics: { requests: number; successful: number; failed: number; errorRate: number; p50Ms: number; p95Ms: number; p99Ms: number };
  recommendations: string[];
  measuredAt: string;
}

export interface Finding {
  id: string;
  runId: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  source: string;
  system: string;
  title: string;
  state: "open" | "resolved" | "accepted";
  detectedAt: string;
}

export interface HealthSnapshot {
  id: string;
  runId: string;
  overallScore: number;
  status: "healthy" | "warning" | "critical";
  dimensions: TestResult["dimensions"];
  systems: Array<{ id: string; label: string; score: number; status: "operational" | "degraded" | "outage" }>;
  capturedAt: string;
}

export interface RunEvent {
  runId: string;
  type: "created" | "started" | "completed" | "cancelled" | "failed";
  actorId?: string;
  at: string;
}

export interface RunnerOutput {
  result: TestResult;
  findings: Finding[];
  health: HealthSnapshot;
}

export interface QualityRepository {
  createRun(run: TestRun): Promise<void>;
  updateRun(run: TestRun): Promise<void>;
  getRun(id: string): Promise<TestRun | undefined>;
  findIdempotentRun(actorId: string, key: string): Promise<TestRun | undefined>;
  listRuns(filters?: { environment?: QualityEnvironment; status?: RunStatus; testType?: TestType; limit?: number }): Promise<TestRun[]>;
  saveOutput(output: RunnerOutput): Promise<void>;
  getResult(runId: string): Promise<TestResult | undefined>;
  listFindings(filters?: { severity?: Finding["severity"]; state?: Finding["state"] }): Promise<Finding[]>;
  getLatestHealth(): Promise<HealthSnapshot | undefined>;
  appendEvent(event: RunEvent): Promise<void>;
  listEvents(runId: string): Promise<RunEvent[]>;
  close?(): Promise<void>;
}

export interface TestRunner {
  run(run: TestRun, signal: AbortSignal): Promise<RunnerOutput>;
}

export interface QualityServerOptions {
  repository: QualityRepository;
  runner: TestRunner;
  now?: () => Date;
  idGenerator?: () => string;
  mockActorsEnabled?: boolean;
  wallboardFreshnessSeconds?: number;
  adapterNames?: { repository: string; runner: string };
}
