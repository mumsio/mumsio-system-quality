import { describe, expect, it } from "vitest";
import type { ActorContext, RunStatus } from "@mumsio/quality-contracts";
import {
  DEFAULT_SERVER_POLICY,
  InvalidRunTransitionError,
  TEST_CATALOG,
  assertRunTransition,
  canTransitionRun,
  capabilitiesForRole,
  evaluateTestExecutionPolicy,
  getTestDefinition,
  roleHasCapability,
  scoreMetrics,
  toCatalogItem,
} from "./index.js";

const owner: ActorContext = { userId: "owner-1", displayName: "Owner", role: "owner" };
const developer: ActorContext = { userId: "dev-1", displayName: "Developer", role: "dev" };

describe("authorization", () => {
  it("maps existing roles to capabilities without client-owned checks", () => {
    expect(capabilitiesForRole("owner")).toEqual([
      "quality:view",
      "quality:run",
      "quality:configure",
      "quality:wallboard:view",
    ]);
    expect(capabilitiesForRole("dev")).not.toContain("quality:configure");
    expect(capabilitiesForRole("support")).toEqual([]);
    expect(capabilitiesForRole("sales")).toEqual([]);
    expect(roleHasCapability("admin", "quality:run")).toBe(true);
    expect(roleHasCapability("support", "quality:view")).toBe(false);
  });
});

describe("catalog", () => {
  it("contains one immutable, unique entry for every test type", () => {
    expect(TEST_CATALOG).toHaveLength(11);
    expect(new Set(TEST_CATALOG.map((definition) => definition.type)).size).toBe(TEST_CATALOG.length);
    expect(getTestDefinition("load").safetyLimits.maxVirtualUsers).toBe(100);
  });

  it("does not expose server-only safety limits in the display projection", () => {
    const projected = toCatalogItem(getTestDefinition("load"));
    expect(projected).not.toHaveProperty("safetyLimits");
    expect(projected.availability).toEqual({ local: true, staging: true, production: true });
  });
});

describe("deny-first execution policy", () => {
  it.each(["stress", "spike", "soak"] as const)("hard denies %s in production", (type) => {
    const definition = { ...getTestDefinition(type), allowedEnvironments: ["production" as const] };
    const decision = evaluateTestExecutionPolicy({
      actor: owner,
      definition,
      environment: "production",
      activeRuns: [],
      serverPolicy: { ...DEFAULT_SERVER_POLICY, productionEnabledTests: [type] },
    });
    expect(decision).toMatchObject({ allowed: false, code: "production_heavy_test_denied" });
  });

  it("denies a developer in production by default", () => {
    expect(evaluateTestExecutionPolicy({
      actor: developer,
      definition: getTestDefinition("quick_health"),
      environment: "production",
      activeRuns: [],
    })).toMatchObject({ allowed: false, code: "production_role_denied" });
  });

  it("allows an owner to run an explicitly enabled passive production check", () => {
    expect(evaluateTestExecutionPolicy({
      actor: owner,
      definition: getTestDefinition("quick_health"),
      environment: "production",
      activeRuns: [],
    })).toEqual({ allowed: true, code: "allowed", policyVersion: "1.0.0" });
  });

  it("denies support and sales before creating a run", () => {
    for (const role of ["support", "sales"] as const) {
      expect(evaluateTestExecutionPolicy({
        actor: { ...owner, role },
        definition: getTestDefinition("load"),
        environment: "staging",
        activeRuns: [],
      })).toMatchObject({ allowed: false, code: "missing_capability" });
    }
  });

  it("allows only one heavy run per environment", () => {
    expect(evaluateTestExecutionPolicy({
      actor: owner,
      definition: getTestDefinition("stress"),
      environment: "staging",
      activeRuns: [{ id: "run-active", environment: "staging", intensity: "heavy", status: "running" }],
    })).toMatchObject({ allowed: false, code: "heavy_test_conflict" });
    expect(evaluateTestExecutionPolicy({
      actor: owner,
      definition: getTestDefinition("stress"),
      environment: "staging",
      activeRuns: [{ id: "run-other", environment: "local", intensity: "heavy", status: "running" }],
    })).toMatchObject({ allowed: true });
  });
});

describe("run state machine", () => {
  const statuses: readonly RunStatus[] = ["queued", "running", "passed", "warning", "failed", "cancelled"];
  const legal = new Set([
    "queued:running", "queued:failed", "queued:cancelled",
    "running:passed", "running:warning", "running:failed", "running:cancelled",
  ]);

  it("accepts every legal transition and rejects every other pair", () => {
    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransitionRun(from, to)).toBe(legal.has(`${from}:${to}`));
      }
    }
  });

  it("throws a typed error for illegal transitions", () => {
    expect(() => assertRunTransition("passed", "running")).toThrow(InvalidRunTransitionError);
    expect(() => assertRunTransition("queued", "running")).not.toThrow();
  });
});

describe("scoring", () => {
  const healthyMetrics = [
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
  ] as const;

  it("is deterministic for a complete healthy result", () => {
    expect(scoreMetrics(healthyMetrics)).toMatchObject({
      overallScore: 100,
      coverage: 1,
      status: "passed",
      missingRequiredMetrics: [],
      hardGateFailures: [],
      scoringVersion: "1.0.0",
    });
    expect(scoreMetrics(healthyMetrics)).toEqual(scoreMetrics(healthyMetrics));
  });

  it("fails closed when critical coverage is missing", () => {
    const result = scoreMetrics(healthyMetrics.slice(0, 3));
    expect(result.coverage).toBeLessThan(0.6);
    expect(result.overallScore).toBeLessThan(60);
    expect(result.status).toBe("failed");
    expect(result.missingRequiredMetrics).toContain("security_critical_count");
  });

  it("uses a hard gate for a critical security finding", () => {
    const metrics = healthyMetrics.map((metric) =>
      metric.key === "security_critical_count" ? { ...metric, value: 1 } : metric,
    );
    const result = scoreMetrics(metrics);
    expect(result.status).toBe("failed");
    expect(result.overallScore).toBeLessThan(60);
    expect(result.hardGateFailures).toEqual(["security_critical_count"]);
  });

  it("rejects duplicate metric keys instead of silently choosing one", () => {
    expect(() => scoreMetrics([...healthyMetrics, healthyMetrics[0]])).toThrow("Duplicate metric key");
  });
});
