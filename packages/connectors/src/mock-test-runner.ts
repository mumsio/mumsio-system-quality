import { randomUUID } from "node:crypto";
import type { Finding, HealthSnapshot, RunnerOutput, TestResult, TestRun, TestRunner } from "@mumsio/quality-server";

export interface MockTestRunnerOptions {
  delayMs?: number;
  now?: () => Date;
  idGenerator?: () => string;
}

export class MockTestRunner implements TestRunner {
  private readonly delayMs: number;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: MockTestRunnerOptions = {}) {
    this.delayMs = options.delayMs ?? 80;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
  }

  async run(run: TestRun, signal: AbortSignal): Promise<RunnerOutput> {
    await abortableDelay(this.delayMs, signal);
    const score = scoreFor(run);
    const status: TestResult["status"] = score >= 90 ? "passed" : score >= 70 ? "warning" : "failed";
    const measuredAt = this.now().toISOString();
    const dimensions = {
      performance: Math.max(0, Math.min(100, score + 1)),
      reliability: Math.max(0, Math.min(100, score - 2)),
      security: run.testType === "security" ? 72 : Math.max(0, Math.min(100, score - 6)),
      efficiency: Math.max(0, Math.min(100, score + 3)),
      releaseQuality: Math.max(0, Math.min(100, score - 1)),
    };
    const result: TestResult = {
      id: this.idGenerator(),
      runId: run.id,
      overallScore: score,
      status,
      dimensions,
      metrics: { requests: 48_215, successful: 48_128, failed: 87, errorRate: 0.18, p50Ms: 128, p95Ms: 342, p99Ms: 612 },
      recommendations: run.testType === "security" ? ["Add the recommended response security headers."] : [],
      measuredAt,
    };
    const findings: Finding[] = run.testType === "security" ? [{
      id: this.idGenerator(), runId: run.id, severity: "medium", source: "mock-security", system: "cloudflare_web", title: "Content Security Policy header not observed", state: "open", detectedAt: measuredAt,
    }] : [];
    const health: HealthSnapshot = {
      id: this.idGenerator(),
      runId: run.id,
      overallScore: score,
      status: score >= 90 ? "healthy" : score >= 70 ? "warning" : "critical",
      dimensions,
      systems: [
        { id: "supabase", label: "Supabase", score: dimensions.reliability, status: "operational" },
        { id: "railway", label: "Railway", score: dimensions.performance, status: "operational" },
        { id: "cloudflare_web", label: "Cloudflare Web", score: dimensions.security, status: dimensions.security >= 80 ? "operational" : "degraded" },
        { id: "mumsio_go_ios", label: "MumsioGo iOS", score: dimensions.releaseQuality, status: "operational" },
        { id: "mumsio_go_android", label: "MumsioGo Android", score: dimensions.releaseQuality, status: "operational" },
      ],
      capturedAt: measuredAt,
    };
    return { result, findings, health };
  }
}

function scoreFor(run: TestRun): number {
  const base: Record<TestRun["testType"], number> = {
    quick_health: 96, load: 92, stress: 84, spike: 78, soak: 91, security: 72,
    efficiency: 95, reliability: 90, performance: 93, full_system: 88, full_release: 91,
  };
  return Math.max(0, base[run.testType] - (run.environment === "production" ? 1 : 0));
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(abortError()); }, { once: true });
  });
}

function abortError(): Error {
  return Object.assign(new Error("Run cancelled"), { name: "AbortError" });
}
