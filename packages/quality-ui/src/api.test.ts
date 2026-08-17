import { describe, expect, it, vi } from "vitest";
import { createQualityApi, QualityApiError } from "./api";

describe("createQualityApi", () => {
  it("posts only predefined run fields with an idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "run-1" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const api = createQualityApi("/quality", fetcher);
    await api.createRun("load", "staging", "request-123");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/quality/runs");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Idempotency-Key": "request-123", "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({ testType: "load", environment: "staging" });
  });

  it("surfaces sanitized server errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: "POLICY_DENIED", message: "Stress tests are disabled in production" }), { status: 403, statusText: "Forbidden", headers: { "Content-Type": "application/json" } }));
    const api = createQualityApi("/quality", fetcher);
    await expect(api.createRun("stress", "production", "request-456")).rejects.toEqual(expect.objectContaining<Partial<QualityApiError>>({ status: 403, code: "POLICY_DENIED", message: "Stress tests are disabled in production" }));
  });

  it("uses conditional wallboard requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 304 }));
    const api = createQualityApi("/quality", fetcher);
    const response = await api.wallboard(undefined, "snapshot-12");
    expect(response.unchanged).toBe(true);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ "If-None-Match": "snapshot-12" });
  });

  it("renders the normalized error-rate metric as a percentage value", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: "run-1",
        testType: "quick_health",
        environment: "staging",
        status: "passed",
        createdAt: "2026-08-17T17:00:00.000Z",
        result: { metrics: { errorRate: 0.18 } },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const api = createQualityApi("/quality", fetcher);

    const run = await api.run("run-1");

    expect(run.metrics).toContainEqual({ label: "Error Rate", value: "0.18%" });
  });
});
