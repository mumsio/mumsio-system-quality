import express, { type ErrorRequestHandler } from "express";
import { InMemoryQualityRepository, QualityService, createQualityRouter, errorEnvelope, type QualityRepository } from "@mumsio/quality-server";
import { MockTestRunner, PostgresQualityRepository } from "@mumsio/quality-connectors";

export interface ApiConfiguration {
  nodeEnv: "development" | "test" | "production";
  databaseUrl?: string;
  mockActorsEnabled: boolean;
  mockRunnerDelayMs: number;
  wallboardFreshnessSeconds: number;
}

export interface ApiRuntime {
  app: express.Express;
  repository: QualityRepository;
  close(): Promise<void>;
}

export function readConfiguration(environment: NodeJS.ProcessEnv = process.env): ApiConfiguration {
  const nodeEnv = environment.NODE_ENV ?? "development";
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") throw new Error("NODE_ENV must be development, test, or production");
  const requestedMockActors = environment.QUALITY_MOCK_ACTORS_ENABLED === undefined ? nodeEnv !== "production" : parseBoolean(environment.QUALITY_MOCK_ACTORS_ENABLED, "QUALITY_MOCK_ACTORS_ENABLED");
  if (nodeEnv === "production" && requestedMockActors) throw new Error("Mock quality actors cannot be enabled in production");
  const databaseUrl = environment.QUALITY_DATABASE_URL?.trim();
  return {
    nodeEnv,
    ...(databaseUrl === undefined || databaseUrl === "" ? {} : { databaseUrl }),
    mockActorsEnabled: requestedMockActors,
    mockRunnerDelayMs: parseInteger(environment.QUALITY_MOCK_RUNNER_DELAY_MS, 80, 0, 60_000, "QUALITY_MOCK_RUNNER_DELAY_MS"),
    wallboardFreshnessSeconds: parseInteger(environment.QUALITY_WALLBOARD_FRESHNESS_SECONDS, 120, 10, 86_400, "QUALITY_WALLBOARD_FRESHNESS_SECONDS"),
  };
}

export function createApiRuntime(configuration: ApiConfiguration = readConfiguration()): ApiRuntime {
  const repository: QualityRepository = configuration.databaseUrl === undefined
    ? new InMemoryQualityRepository()
    : new PostgresQualityRepository(configuration.databaseUrl);
  const runner = new MockTestRunner({ delayMs: configuration.mockRunnerDelayMs });
  const service = new QualityService({ repository, runner, mockActorsEnabled: configuration.mockActorsEnabled, wallboardFreshnessSeconds: configuration.wallboardFreshnessSeconds, adapterNames: { repository: configuration.databaseUrl === undefined ? "in-memory" : "postgres", runner: "mock" } });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb", strict: true }));
  app.get("/healthz", (_request, response) => response.json({ status: "ok", service: "mumsio-quality-api" }));
  app.use("/api/quality", createQualityRouter(service, { mockActorsEnabled: configuration.mockActorsEnabled }));
  app.use((_request, response) => response.status(404).json({ error: { code: "route_not_found", message: "The requested route was not found." } }));
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (isJsonParseError(error)) return response.status(400).json({ error: { code: "invalid_json", message: "The request body is not valid JSON." } });
    const envelope = errorEnvelope(error);
    response.status(envelope.status).json(envelope.body);
  };
  app.use(errorHandler);
  return { app, repository, close: async () => { await repository.close?.(); } };
}

function parseBoolean(value: string, name: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return parsed;
}

function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError && typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed";
}
