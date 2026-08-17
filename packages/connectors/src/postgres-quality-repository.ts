import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type {
  Finding,
  HealthSnapshot,
  QualityEnvironment,
  QualityRepository,
  RunEvent,
  RunnerOutput,
  RunStatus,
  TestResult,
  TestRun,
  TestType,
} from "@mumsio/quality-server";

export class PostgresQualityRepository implements QualityRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    if (connectionString.trim() === "") throw new Error("QUALITY_DATABASE_URL cannot be empty");
    this.pool = new Pool({ connectionString, max: 8, application_name: "mumsio-quality-api" });
  }

  async createRun(run: TestRun): Promise<void> {
    await this.pool.query(
      `insert into quality.test_runs
        (id, test_type, environment, status, requested_by_user_id, requested_role, idempotency_key,
         definition_version, policy_version, runner_type, requested_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'mock',$10,$11::jsonb)`,
      [run.id, run.testType, run.environment, run.status, run.requestedBy.id, run.requestedRole, run.idempotencyKey, run.testDefinitionVersion, run.policyVersion, run.createdAt, JSON.stringify({ requesterDisplayName: run.requestedBy.displayName })],
    );
  }

  async updateRun(run: TestRun): Promise<void> {
    const result = await this.pool.query(
      `update quality.test_runs set status=$2, started_at=$3, completed_at=$4,
         cancelled_at=case when $2='cancelled' then $4::timestamptz else null end,
         failure_code=$5, failure_message=$6, release_version=$7
       where id=$1`,
      [run.id, run.status, run.startedAt ?? null, run.completedAt ?? null, run.error?.code ?? null, run.error?.message ?? null, run.release ?? null],
    );
    if (result.rowCount === 0) throw new Error(`Run ${run.id} does not exist`);
  }

  async getRun(id: string): Promise<TestRun | undefined> {
    const result = await this.pool.query(
      `select test_run.*, test_result.score as result_score
       from quality.test_runs as test_run
       left join quality.test_results as test_result on test_result.test_run_id = test_run.id
       where test_run.id=$1`,
      [id],
    );
    return result.rows[0] === undefined ? undefined : mapRun(result.rows[0]);
  }

  async findIdempotentRun(actorId: string, key: string): Promise<TestRun | undefined> {
    const result = await this.pool.query(
      `select test_run.*, test_result.score as result_score
       from quality.test_runs as test_run
       left join quality.test_results as test_result on test_result.test_run_id = test_run.id
       where test_run.requested_by_user_id=$1 and test_run.idempotency_key=$2`,
      [actorId, key],
    );
    return result.rows[0] === undefined ? undefined : mapRun(result.rows[0]);
  }

  async listRuns(filters: { environment?: QualityEnvironment; status?: RunStatus; testType?: TestType; limit?: number } = {}): Promise<TestRun[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filters.environment !== undefined) { values.push(filters.environment); clauses.push(`test_run.environment=$${values.length}`); }
    if (filters.status !== undefined) { values.push(filters.status); clauses.push(`test_run.status=$${values.length}`); }
    if (filters.testType !== undefined) { values.push(filters.testType); clauses.push(`test_run.test_type=$${values.length}`); }
    values.push(filters.limit ?? 50);
    const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
    const result = await this.pool.query(
      `select test_run.*, test_result.score as result_score
       from quality.test_runs as test_run
       left join quality.test_results as test_result on test_result.test_run_id = test_run.id
       ${where}
       order by test_run.requested_at desc, test_run.id desc
       limit $${values.length}`,
      values,
    );
    return result.rows.map(mapRun);
  }

  async saveOutput(output: RunnerOutput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.insertResult(client, output.result);
      for (const finding of output.findings) await this.upsertFinding(client, finding);
      const run = await client.query(`select environment from quality.test_runs where id=$1`, [output.result.runId]);
      if (run.rows[0] === undefined) throw new Error("Result references an unknown run");
      await client.query(
        `insert into quality.system_health
          (id, environment, overall_score, overall_status, coverage, dimensions, systems, source_test_run_id, captured_at)
         values ($1,$2,$3,$4,100,$5::jsonb,$6::jsonb,$7,$8)`,
        [output.health.id, run.rows[0].environment, output.health.overallScore, output.health.status, JSON.stringify(output.health.dimensions), JSON.stringify(output.health.systems), output.health.runId, output.health.capturedAt],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertResult(client: PoolClient, result: TestResult): Promise<void> {
    await client.query(
      `insert into quality.test_results
        (id, test_run_id, schema_version, status, score, coverage, duration_ms, metrics, recommendations, metadata)
       values ($1,$2,'2026.08.1',$3,$4,100,0,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [result.id, result.runId, result.status, result.overallScore, JSON.stringify(result.metrics), JSON.stringify(result.recommendations), JSON.stringify({ dimensions: result.dimensions, measuredAt: result.measuredAt })],
    );
  }

  private async upsertFinding(client: PoolClient, finding: Finding): Promise<void> {
    const fingerprint = `${finding.source}:${finding.system}:${finding.title}`.toLowerCase();
    await client.query(
      `insert into quality.findings
        (id, fingerprint, severity, title, system_id, description, source, status, first_test_run_id, last_test_run_id, first_detected_at, last_detected_at)
       values ($1,$2,$3,$4,$5,$4,$6,$7,$8,$8,$9,$9)
       on conflict (fingerprint) do update set
         severity=excluded.severity, last_test_run_id=excluded.last_test_run_id,
         last_detected_at=excluded.last_detected_at, occurrence_count=quality.findings.occurrence_count+1`,
      [finding.id, fingerprint, toDbSeverity(finding.severity), finding.title, finding.system, finding.source, toDbFindingStatus(finding.state), finding.runId, finding.detectedAt],
    );
  }

  async getResult(runId: string): Promise<TestResult | undefined> {
    const result = await this.pool.query(`select * from quality.test_results where test_run_id=$1`, [runId]);
    return result.rows[0] === undefined ? undefined : mapResult(result.rows[0]);
  }

  async listFindings(filters: { severity?: Finding["severity"]; state?: Finding["state"] } = {}): Promise<Finding[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filters.severity !== undefined) { values.push(toDbSeverity(filters.severity)); clauses.push(`severity=$${values.length}`); }
    if (filters.state !== undefined) { values.push(toDbFindingStatus(filters.state)); clauses.push(`status=$${values.length}`); }
    const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
    const result = await this.pool.query(`select * from quality.findings ${where} order by last_detected_at desc, id desc`, values);
    return result.rows.map(mapFinding);
  }

  async getLatestHealth(): Promise<HealthSnapshot | undefined> {
    const result = await this.pool.query(`select * from quality.system_health order by captured_at desc, id desc limit 1`);
    return result.rows[0] === undefined ? undefined : mapHealth(result.rows[0]);
  }

  async appendEvent(event: RunEvent): Promise<void> {
    await this.pool.query(
      `insert into quality.test_run_events
        (test_run_id, event_type, actor_type, actor_user_id, message, metadata)
       values ($1,$2,'system',$3,$4,$5::jsonb)`,
      [event.runId, toDbEventType(event.type), isUuid(event.actorId) ? event.actorId : null, event.type, JSON.stringify({ originalType: event.type, at: event.at })],
    );
  }

  async listEvents(runId: string): Promise<RunEvent[]> {
    const result = await this.pool.query(`select * from quality.test_run_events where test_run_id=$1 order by created_at, id`, [runId]);
    return result.rows.map((row) => ({ runId: row.test_run_id, type: eventType(row), ...(row.actor_user_id === null ? {} : { actorId: row.actor_user_id }), at: iso(row.created_at) }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapRun(row: QueryResultRow): TestRun {
  const metadata = object(row.metadata);
  return {
    id: row.id, testType: row.test_type, testDefinitionVersion: row.definition_version, policyVersion: row.policy_version,
    environment: row.environment, status: row.status,
    requestedBy: { id: row.requested_by_user_id, displayName: typeof metadata.requesterDisplayName === "string" ? metadata.requesterDisplayName : "Quality user" },
    requestedRole: row.requested_role, idempotencyKey: row.idempotency_key, createdAt: iso(row.requested_at),
    ...(row.started_at === null ? {} : { startedAt: iso(row.started_at) }), ...(row.completed_at === null ? {} : { completedAt: iso(row.completed_at) }),
    ...(row.release_version === null ? {} : { release: row.release_version }),
    ...(row.result_score === null || row.result_score === undefined ? {} : { score: Number(row.result_score) }),
    ...(row.failure_code === null ? {} : { error: { code: row.failure_code, message: row.failure_message ?? "The run failed." } }),
  };
}

function mapResult(row: QueryResultRow): TestResult {
  const metadata = object(row.metadata);
  return { id: row.id, runId: row.test_run_id, overallScore: row.score, status: row.status, dimensions: metadata.dimensions as TestResult["dimensions"], metrics: row.metrics, recommendations: row.recommendations, measuredAt: typeof metadata.measuredAt === "string" ? metadata.measuredAt : iso(row.created_at) };
}

function mapFinding(row: QueryResultRow): Finding {
  return { id: row.id, runId: row.last_test_run_id ?? row.first_test_run_id, severity: fromDbSeverity(row.severity), source: row.source, system: row.system_id, title: row.title, state: fromDbFindingStatus(row.status), detectedAt: iso(row.last_detected_at) };
}

function mapHealth(row: QueryResultRow): HealthSnapshot {
  return { id: row.id, runId: row.source_test_run_id, overallScore: row.overall_score, status: row.overall_status, dimensions: row.dimensions, systems: row.systems, capturedAt: iso(row.captured_at) };
}

function toDbSeverity(value: Finding["severity"]): string { return value === "info" ? "informational" : value; }
function fromDbSeverity(value: string): Finding["severity"] { return value === "informational" ? "info" : value as Finding["severity"]; }
function toDbFindingStatus(value: Finding["state"]): string { return value === "accepted" ? "acknowledged" : value; }
function fromDbFindingStatus(value: string): Finding["state"] { return value === "acknowledged" || value === "false_positive" ? "accepted" : value as Finding["state"]; }
function toDbEventType(value: RunEvent["type"]): string { return value === "created" ? "created" : value === "cancelled" ? "cancel_requested" : "status_changed"; }
function eventType(row: QueryResultRow): RunEvent["type"] { const value = object(row.metadata).originalType; return typeof value === "string" ? value as RunEvent["type"] : row.event_type === "cancel_requested" ? "cancelled" : "completed"; }
function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function object(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function isUuid(value: string | undefined): value is string { return value !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
