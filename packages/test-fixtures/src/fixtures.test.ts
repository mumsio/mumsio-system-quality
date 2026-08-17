import { describe, expect, it } from "vitest";
import { NormalizedTestResultSchema, TestRunSchema } from "@mumsio/quality-contracts";
import {
  FAILED_RESULT_FIXTURE,
  HEALTHY_RESULT_FIXTURE,
  PARTIAL_OUTAGE_RESULT_FIXTURE,
  REGRESSION_RESULT_FIXTURE,
  SECURITY_WARNING_RESULT_FIXTURE,
  WARNING_RESULT_FIXTURE,
  buildNormalizedResult,
  buildTestRun,
  metricsForScenario,
} from "./index.js";

describe("deterministic quality fixtures", () => {
  it.each([
    HEALTHY_RESULT_FIXTURE,
    WARNING_RESULT_FIXTURE,
    FAILED_RESULT_FIXTURE,
    REGRESSION_RESULT_FIXTURE,
    SECURITY_WARNING_RESULT_FIXTURE,
    PARTIAL_OUTAGE_RESULT_FIXTURE,
  ])("conforms to the normalized wire schema", (fixture) => {
    expect(NormalizedTestResultSchema.safeParse(fixture).success).toBe(true);
  });

  it("provides stable healthy, warning, and failed golden outcomes", () => {
    expect(HEALTHY_RESULT_FIXTURE).toMatchObject({ status: "passed", overallScore: 100, coverage: 1 });
    expect(WARNING_RESULT_FIXTURE.status).toBe("warning");
    expect(WARNING_RESULT_FIXTURE.overallScore).toBeGreaterThanOrEqual(60);
    expect(WARNING_RESULT_FIXTURE.overallScore).toBeLessThan(85);
    expect(FAILED_RESULT_FIXTURE.status).toBe("failed");
    expect(FAILED_RESULT_FIXTURE.overallScore).toBeLessThan(60);
  });

  it("rebuilds byte-for-byte deterministic results", () => {
    expect(buildNormalizedResult("healthy")).toEqual(buildNormalizedResult("healthy"));
    expect(metricsForScenario("warning")).toEqual(metricsForScenario("warning"));
  });

  it("keeps security findings sanitized for shared consumers", () => {
    expect(SECURITY_WARNING_RESULT_FIXTURE.findings).toHaveLength(1);
    expect(SECURITY_WARNING_RESULT_FIXTURE.findings[0]?.endpoint).toBeNull();
    expect(JSON.stringify(SECURITY_WARNING_RESULT_FIXTURE)).not.toContain("https://");
  });

  it("makes partial outage coverage visible and never healthy", () => {
    expect(PARTIAL_OUTAGE_RESULT_FIXTURE.coverage).toBeLessThan(1);
    expect(PARTIAL_OUTAGE_RESULT_FIXTURE.status).toBe("failed");
  });

  it("builds schema-valid runs with controlled overrides", () => {
    const run = buildTestRun({ id: "run-custom", status: "warning" });
    expect(TestRunSchema.parse(run)).toEqual(run);
  });
});
