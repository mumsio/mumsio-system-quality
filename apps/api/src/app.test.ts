import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiRuntime, readConfiguration, type ApiRuntime } from "./app.js";

const actor = {
  "x-quality-user-id": "10000000-0000-4000-8000-000000000001",
  "x-quality-role": "owner",
  "x-quality-user-name": "Quality Owner",
};
const runtimes: ApiRuntime[] = [];

function runtime(delay = 5): ApiRuntime {
  const created = createApiRuntime({ nodeEnv: "test", mockActorsEnabled: true, mockRunnerDelayMs: delay, wallboardFreshnessSeconds: 120 });
  runtimes.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((item) => item.close()));
});

describe("Quality API", () => {
  it("reports service health without authentication", async () => {
    const response = await request(runtime().app).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "mumsio-quality-api" });
  });

  it("requires an explicit development actor", async () => {
    const response = await request(runtime().app).get("/api/quality/catalog");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_mock_actor");
  });

  it("exposes canonical capabilities and catalog", async () => {
    const api = runtime().app;
    const capabilities = await request(api).get("/api/quality/capabilities").set(actor);
    const catalog = await request(api).get("/api/quality/catalog").set(actor);
    expect(capabilities.status).toBe(200);
    expect(capabilities.body.data.run).toBe(true);
    expect(catalog.status).toBe(200);
    expect(catalog.body.data).toHaveLength(11);
    expect(catalog.body.data[0]).not.toHaveProperty("safetyLimits");
  });

  it("keeps all health cards visible before the first test", async () => {
    const response = await request(runtime().app).get("/api/quality/dashboard?environment=staging").set(actor);

    expect(response.status).toBe(200);
    expect(response.body.data.hasData).toBe(false);
    expect(response.body.data.dimensions).toHaveLength(5);
    expect(response.body.data.dimensions.every((item: { status: string }) => item.status === "unknown")).toBe(true);
    expect(response.body.data.systems.map((item: { name: string }) => item.name)).toEqual([
      "Supabase",
      "Railway",
      "Cloudflare / Web",
      "MumsioGo iOS",
      "MumsioGo Android",
    ]);
    expect(response.body.data.systems.every((item: { status: string }) => item.status === "unknown")).toBe(true);
  });

  it("runs a deterministic test through queued, running, and completed states", async () => {
    const api = runtime(10).app;
    const created = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "load-demo-0001").send({ testType: "load", environment: "staging" });
    expect(created.status).toBe(202);
    expect(["queued", "running"]).toContain(created.body.data.status);
    const runId = created.body.data.id as string;
    const detail = await waitForTerminal(api, runId);
    expect(detail.body.data.status).toBe("passed");
    expect(detail.body.data.result.overallScore).toBe(92);
    expect(detail.body.data.events.map((event: { type: string }) => event.type)).toEqual(["created", "started", "completed"]);
    const result = await request(api).get(`/api/quality/runs/${runId}/results`).set(actor);
    expect(result.status).toBe(200);
    expect(result.body.data.metrics.p95Ms).toBe(342);
  });

  it("replays an idempotent request and rejects key reuse with a different payload", async () => {
    const api = runtime(50).app;
    const first = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "retry-key-0001").send({ testType: "quick_health", environment: "staging" });
    const replay = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "retry-key-0001").send({ testType: "quick_health", environment: "staging" });
    const conflict = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "retry-key-0001").send({ testType: "security", environment: "staging" });
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.body.meta.idempotentReplay).toBe(true);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("idempotency_conflict");
  });

  it("enforces production and heavy-test concurrency policy", async () => {
    const api = runtime(100).app;
    const production = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "prod-stress-001").send({ testType: "stress", environment: "production" });
    expect(production.status).toBe(403);
    const first = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "heavy-run-0001").send({ testType: "stress", environment: "staging" });
    const second = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "heavy-run-0002").send({ testType: "spike", environment: "staging" });
    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("heavy_test_conflict");
  });

  it("cancels active work and leaves terminal runs immutable", async () => {
    const api = runtime(500).app;
    const created = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "cancel-run-0001").send({ testType: "load", environment: "staging" });
    const runId = created.body.data.id as string;
    const cancelled = await request(api).post(`/api/quality/runs/${runId}/cancel`).set(actor);
    const again = await request(api).post(`/api/quality/runs/${runId}/cancel`).set(actor);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("run_terminal");
  });

  it("serves history, health, findings, comparison and a sanitized ETag wallboard", async () => {
    const api = runtime(1).app;
    for (const [testType, key] of [["security", "security-run-001"], ["quick_health", "health-run-0001"]] as const) {
      const created = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", key).send({ testType, environment: "staging" });
      await waitForTerminal(api, created.body.data.id);
    }
    const history = await request(api).get("/api/quality/runs?environment=staging&limit=10").set(actor);
    const health = await request(api).get("/api/quality/health/latest").set(actor);
    const findings = await request(api).get("/api/quality/findings?state=open").set(actor);
    const comparison = await request(api).get("/api/quality/release-comparison").set(actor);
    const wallboard = await request(api).get("/api/quality/wallboard").set(actor);
    expect(history.body.data.total).toBe(2);
    expect(health.body.data.overallScore).toBe(96);
    expect(wallboard.body.data.systems).toHaveLength(5);
    expect(findings.body.data.items).toHaveLength(1);
    expect(comparison.body.data.metrics[0].change).toBe(24);
    expect(wallboard.status).toBe(200);
    expect(wallboard.headers.etag).toMatch(/^W\//);
    expect(JSON.stringify(wallboard.body)).not.toContain("Quality Owner");
    expect(JSON.stringify(wallboard.body)).not.toContain("10000000-0000-4000-8000-000000000001");
    const unchanged = await request(api).get("/api/quality/wallboard").set(actor).set("If-None-Match", wallboard.headers.etag as string);
    expect(unchanged.status).toBe(304);
  });

  it("denies unauthorized roles and arbitrary execution fields", async () => {
    const api = runtime().app;
    const support = { ...actor, "x-quality-role": "support" };
    const denied = await request(api).get("/api/quality/catalog").set(support);
    const arbitrary = await request(api).post("/api/quality/runs").set(actor).set("Idempotency-Key", "unsafe-request-1").send({ testType: "load", environment: "staging", url: "https://example.com" });
    expect(denied.status).toBe(403);
    expect(arbitrary.status).toBe(400);
  });
});

describe("configuration", () => {
  it("defaults to in-memory development and fails closed for production mock actors", () => {
    expect(readConfiguration({}).mockActorsEnabled).toBe(true);
    expect(() => readConfiguration({ NODE_ENV: "production", QUALITY_MOCK_ACTORS_ENABLED: "true" })).toThrow(/cannot be enabled/);
    expect(readConfiguration({ NODE_ENV: "production" }).mockActorsEnabled).toBe(false);
  });
});

async function waitForTerminal(app: ApiRuntime["app"], runId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request(app).get(`/api/quality/runs/${runId}`).set(actor);
    if (["passed", "warning", "failed", "cancelled"].includes(response.body.data.status)) return response;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} did not finish`);
}
