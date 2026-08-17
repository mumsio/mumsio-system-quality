import type {
  ActorContext,
  MetricValue,
  NormalizedTestResult,
  SecurityFinding,
  TestRun,
} from "@mumsio/quality-contracts";
import { scoreMetrics } from "@mumsio/quality-domain";

export const FIXTURE_NOW = "2026-08-17T10:00:00.000Z";

export const FIXTURE_ACTORS = {
  owner: { userId: "user-owner-001", displayName: "Mumsio Owner", role: "owner" },
  admin: { userId: "user-admin-001", displayName: "Mumsio Admin", role: "admin" },
  developer: { userId: "user-dev-001", displayName: "Mumsio Developer", role: "dev" },
  support: { userId: "user-support-001", displayName: "Mumsio Support", role: "support" },
} as const satisfies Record<string, ActorContext>;

export type FixtureScenario =
  | "healthy"
  | "warning"
  | "failed"
  | "regression"
  | "security_warning"
  | "partial_outage";

const HEALTHY_METRICS = [
  { key: "availability_ratio", value: 0.999, unit: "ratio" },
  { key: "error_rate_ratio", value: 0.002, unit: "ratio" },
  { key: "p95_response_ms", value: 220, unit: "ms" },
  { key: "p99_response_ms", value: 480, unit: "ms" },
  { key: "requests_per_second", value: 100, unit: "req/s" },
  { key: "security_critical_count", value: 0, unit: "count" },
  { key: "security_high_count", value: 0, unit: "count" },
  { key: "resource_efficiency_ratio", value: 0.92, unit: "ratio" },
  { key: "release_regression_percent", value: 2, unit: "percent" },
  { key: "release_error_rate_delta_percent", value: 4, unit: "percent" },
] as const satisfies readonly MetricValue[];

const WARNING_METRICS = [
  { key: "availability_ratio", value: 0.985, unit: "ratio" },
  { key: "error_rate_ratio", value: 0.02, unit: "ratio" },
  { key: "p95_response_ms", value: 550, unit: "ms" },
  { key: "p99_response_ms", value: 900, unit: "ms" },
  { key: "requests_per_second", value: 60, unit: "req/s" },
  { key: "security_critical_count", value: 0, unit: "count" },
  { key: "security_high_count", value: 1, unit: "count" },
  { key: "resource_efficiency_ratio", value: 0.78, unit: "ratio" },
  { key: "release_regression_percent", value: 12, unit: "percent" },
  { key: "release_error_rate_delta_percent", value: 18, unit: "percent" },
] as const satisfies readonly MetricValue[];

const FAILED_METRICS = [
  { key: "availability_ratio", value: 0.91, unit: "ratio" },
  { key: "error_rate_ratio", value: 0.08, unit: "ratio" },
  { key: "p95_response_ms", value: 1_400, unit: "ms" },
  { key: "p99_response_ms", value: 2_200, unit: "ms" },
  { key: "requests_per_second", value: 20, unit: "req/s" },
  { key: "security_critical_count", value: 1, unit: "count" },
  { key: "security_high_count", value: 4, unit: "count" },
  { key: "resource_efficiency_ratio", value: 0.5, unit: "ratio" },
  { key: "release_regression_percent", value: 35, unit: "percent" },
  { key: "release_error_rate_delta_percent", value: 40, unit: "percent" },
] as const satisfies readonly MetricValue[];

const REGRESSION_METRICS = WARNING_METRICS.map((metric) => {
  if (metric.key === "release_regression_percent") return { ...metric, value: 24 };
  if (metric.key === "release_error_rate_delta_percent") return { ...metric, value: 30 };
  return metric;
});

const SECURITY_WARNING_METRICS = HEALTHY_METRICS.map((metric) =>
  metric.key === "security_high_count" ? { ...metric, value: 1 } : metric,
);

const PARTIAL_OUTAGE_METRICS = FAILED_METRICS.filter((metric) =>
  !["resource_efficiency_ratio", "release_regression_percent", "release_error_rate_delta_percent"].includes(metric.key),
);

const SCENARIO_METRICS: Readonly<Record<FixtureScenario, readonly MetricValue[]>> = {
  healthy: HEALTHY_METRICS,
  warning: WARNING_METRICS,
  failed: FAILED_METRICS,
  regression: REGRESSION_METRICS,
  security_warning: SECURITY_WARNING_METRICS,
  partial_outage: PARTIAL_OUTAGE_METRICS,
};

export function metricsForScenario(scenario: FixtureScenario): readonly MetricValue[] {
  return SCENARIO_METRICS[scenario].map((metric) => ({ ...metric }));
}

export function buildTestRun(
  overrides: Partial<TestRun> = {},
): TestRun {
  return {
    id: "run-fixture-001",
    testType: "load",
    environment: "staging",
    status: "passed",
    requestedByUserId: FIXTURE_ACTORS.owner.userId,
    testDefinitionVersion: "1.0.0",
    policyVersion: "1.0.0",
    createdAt: "2026-08-17T09:58:00.000Z",
    startedAt: "2026-08-17T09:58:05.000Z",
    completedAt: FIXTURE_NOW,
    ...overrides,
  };
}

function findingsForScenario(scenario: FixtureScenario): SecurityFinding[] {
  if (scenario !== "failed" && scenario !== "security_warning") return [];
  const critical = scenario === "failed";
  return [{
    id: `finding-${scenario}-001`,
    fingerprint: `fixture:${scenario}:security-header`,
    severity: critical ? "critical" : "high",
    source: "fixture-scanner",
    system: "cloudflare_web",
    endpoint: null,
    description: critical
      ? "A deterministic critical fixture finding."
      : "A deterministic high-severity fixture finding.",
    state: "open",
    detectedAt: FIXTURE_NOW,
  }];
}

export function buildNormalizedResult(
  scenario: FixtureScenario,
  overrides: Partial<NormalizedTestResult> = {},
): NormalizedTestResult {
  const summary = scoreMetrics(metricsForScenario(scenario));
  return {
    schemaVersion: "1.0.0",
    testRunId: "run-fixture-001",
    status: summary.status,
    overallScore: summary.overallScore,
    coverage: summary.coverage,
    metrics: [...summary.metrics],
    dimensions: [...summary.dimensions],
    findings: findingsForScenario(scenario),
    recommendations: summary.hardGateFailures.length > 0
      ? ["Resolve hard-gate failures before release."]
      : summary.status === "warning"
        ? ["Review warning metrics before release."]
        : [],
    rawReference: `fixture://${scenario}`,
    calculatedAt: FIXTURE_NOW,
    scoringVersion: summary.scoringVersion,
    ...overrides,
  };
}

export const HEALTHY_RESULT_FIXTURE = buildNormalizedResult("healthy");
export const WARNING_RESULT_FIXTURE = buildNormalizedResult("warning");
export const FAILED_RESULT_FIXTURE = buildNormalizedResult("failed");
export const REGRESSION_RESULT_FIXTURE = buildNormalizedResult("regression");
export const SECURITY_WARNING_RESULT_FIXTURE = buildNormalizedResult("security_warning");
export const PARTIAL_OUTAGE_RESULT_FIXTURE = buildNormalizedResult("partial_outage");
