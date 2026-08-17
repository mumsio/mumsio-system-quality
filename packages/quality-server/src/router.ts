import { createHash } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { ActorContextSchema, CreateTestRunRequestSchema } from "@mumsio/quality-contracts";
import { ApiError } from "./errors.js";
import { environments, testTypes, type ActorContext, type ActorRole, type Finding, type QualityEnvironment, type RunStatus, type TestType } from "./model.js";
import { findingView, QualityService, runView } from "./service.js";

const roles: ActorRole[] = ["owner", "admin", "dev", "support", "sales"];
const statuses: RunStatus[] = ["queued", "running", "passed", "warning", "failed", "cancelled"];
const severities: Finding["severity"][] = ["critical", "high", "medium", "low", "info"];
const findingStates: Finding["state"][] = ["open", "resolved", "accepted"];

export function mockActorMiddleware(enabled: boolean): RequestHandler {
  return (request, response, next) => {
    if (!enabled) return next(new ApiError(401, "authentication_required", "Authentication is required."));
    const id = header(request, "x-quality-user-id");
    const role = header(request, "x-quality-role");
    const displayName = header(request, "x-quality-user-name");
    if (id === undefined || role === undefined || displayName === undefined || !roles.includes(role as ActorRole)) {
      return next(new ApiError(401, "invalid_mock_actor", "Valid development actor headers are required."));
    }
    response.locals.actor = ActorContextSchema.parse({ userId: id, role, displayName });
    next();
  };
}

export function createQualityRouter(service: QualityService, options: { mockActorsEnabled: boolean }): Router {
  const router = Router();
  router.use(mockActorMiddleware(options.mockActorsEnabled));

  router.get("/capabilities", asyncRoute(async (_request, response) => {
    response.json({ data: service.capabilities(actor(response)) });
  }));

  router.get("/catalog", asyncRoute(async (_request, response) => {
    response.json({ data: service.catalog(actor(response)) });
  }));

  router.post("/runs", asyncRoute(async (request, response) => {
    if (!isRecord(request.body)) throw new ApiError(400, "invalid_request", "A JSON request body is required.");
    const parsed = CreateTestRunRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, "invalid_request", "Only a valid testType and environment may be supplied.");
    const key = header(request, "idempotency-key");
    if (key === undefined) throw new ApiError(400, "idempotency_key_required", "Idempotency-Key is required.");
    const created = await service.createRun(actor(response), parsed.data, key);
    response.status(created.replayed ? 200 : 202).json({ data: runView(created.run), meta: { idempotentReplay: created.replayed } });
  }));

  router.get("/runs", asyncRoute(async (request, response) => {
    const environment = optionalEnum(request.query.environment, environments, "environment") as QualityEnvironment | undefined;
    const status = optionalEnum(request.query.status, statuses, "status") as RunStatus | undefined;
    const testType = optionalEnum(request.query.testType, testTypes, "testType") as TestType | undefined;
    const limit = optionalLimit(request.query.limit);
    const runs = await service.listRuns(actor(response), { ...(environment === undefined ? {} : { environment }), ...(status === undefined ? {} : { status }), ...(testType === undefined ? {} : { testType }), ...(limit === undefined ? {} : { limit }) });
    response.json({ data: { items: runs.map(runView), total: runs.length } });
  }));

  router.get("/runs/:runId", asyncRoute(async (request, response) => {
    const detail = await service.getRunDetail(actor(response), requiredParam(request.params.runId));
    response.json({ data: { ...runView(detail.run), result: detail.result, events: detail.events } });
  }));

  router.post("/runs/:runId/cancel", asyncRoute(async (request, response) => {
    response.json({ data: runView(await service.cancelRun(actor(response), requiredParam(request.params.runId))) });
  }));

  router.get("/runs/:runId/results", asyncRoute(async (request, response) => {
    response.json({ data: await service.result(actor(response), requiredParam(request.params.runId)) });
  }));

  router.get("/findings", asyncRoute(async (request, response) => {
    const severity = optionalEnum(request.query.severity, severities, "severity") as Finding["severity"] | undefined;
    const state = optionalEnum(request.query.state, findingStates, "state") as Finding["state"] | undefined;
    const findings = await service.findings(actor(response), { ...(severity === undefined ? {} : { severity }), ...(state === undefined ? {} : { state }) });
    const totals = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const finding of findings) totals[finding.severity] += 1;
    response.json({ data: { items: findings.map(findingView), totals } });
  }));

  router.get("/health/latest", asyncRoute(async (_request, response) => {
    response.json({ data: await service.latestHealth(actor(response)) });
  }));

  router.get("/dashboard", asyncRoute(async (request, response) => {
    const environment = optionalEnum(request.query.environment, environments, "environment") as QualityEnvironment | undefined;
    response.json({ data: await service.dashboard(actor(response), environment) });
  }));

  router.get("/configuration", asyncRoute(async (_request, response) => {
    response.json({ data: service.configuration(actor(response)) });
  }));

  router.get("/release-comparison", asyncRoute(async (_request, response) => {
    response.json({ data: await service.releaseComparison(actor(response)) });
  }));

  router.get("/releases/comparison", asyncRoute(async (_request, response) => {
    response.json({ data: await service.releaseComparison(actor(response)) });
  }));

  router.get("/wallboard", asyncRoute(async (request, response) => {
    const payload = await service.wallboard(actor(response));
    const body = JSON.stringify({ data: payload });
    const validatorState = JSON.stringify({ ...payload, generatedAt: "" });
    const etag = `W/\"${createHash("sha256").update(validatorState).digest("base64url")}\"`;
    response.set("ETag", etag).set("Cache-Control", "private, no-cache");
    if (request.headers["if-none-match"] === etag) return response.status(304).end();
    response.type("application/json").send(body);
  }));

  return router;
}

function actor(response: { locals: Record<string, unknown> }): ActorContext {
  return response.locals.actor as ActorContext;
}

function header(request: { header(name: string): string | undefined }, name: string): string | undefined {
  const value = request.header(name)?.trim();
  return value === "" ? undefined : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) throw new ApiError(400, "invalid_run_id", "A run ID is required.");
  return value;
}

function optionalEnum(value: unknown, allowed: readonly string[], field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) throw new ApiError(400, `invalid_${field}`, `A valid ${field} is required.`);
  return value;
}

function optionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new ApiError(400, "invalid_limit", "limit must be an integer between 1 and 100.");
  const parsed = Number(value);
  if (parsed < 1 || parsed > 100) throw new ApiError(400, "invalid_limit", "limit must be an integer between 1 and 100.");
  return parsed;
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => { Promise.resolve(handler(request, response, next)).catch(next); };
}
