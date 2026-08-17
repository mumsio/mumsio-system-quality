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
} from "./model.js";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryQualityRepository implements QualityRepository {
  private readonly runs = new Map<string, TestRun>();
  private readonly results = new Map<string, TestResult>();
  private readonly findings = new Map<string, Finding>();
  private readonly health: HealthSnapshot[] = [];
  private readonly events: RunEvent[] = [];

  async createRun(run: TestRun): Promise<void> {
    if (this.runs.has(run.id)) throw new Error(`Run ${run.id} already exists`);
    this.runs.set(run.id, copy(run));
  }

  async updateRun(run: TestRun): Promise<void> {
    if (!this.runs.has(run.id)) throw new Error(`Run ${run.id} does not exist`);
    this.runs.set(run.id, copy(run));
  }

  async getRun(id: string): Promise<TestRun | undefined> {
    const run = this.runs.get(id);
    return run === undefined ? undefined : copy(run);
  }

  async findIdempotentRun(actorId: string, key: string): Promise<TestRun | undefined> {
    const run = [...this.runs.values()].find((candidate) => candidate.requestedBy.id === actorId && candidate.idempotencyKey === key);
    return run === undefined ? undefined : copy(run);
  }

  async listRuns(filters: { environment?: QualityEnvironment; status?: RunStatus; testType?: TestType; limit?: number } = {}): Promise<TestRun[]> {
    return [...this.runs.values()]
      .filter((run) => filters.environment === undefined || run.environment === filters.environment)
      .filter((run) => filters.status === undefined || run.status === filters.status)
      .filter((run) => filters.testType === undefined || run.testType === filters.testType)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, filters.limit ?? 50)
      .map(copy);
  }

  async saveOutput(output: RunnerOutput): Promise<void> {
    this.results.set(output.result.runId, copy(output.result));
    for (const finding of output.findings) this.findings.set(finding.id, copy(finding));
    this.health.push(copy(output.health));
  }

  async getResult(runId: string): Promise<TestResult | undefined> {
    const result = this.results.get(runId);
    return result === undefined ? undefined : copy(result);
  }

  async listFindings(filters: { severity?: Finding["severity"]; state?: Finding["state"] } = {}): Promise<Finding[]> {
    return [...this.findings.values()]
      .filter((finding) => filters.severity === undefined || finding.severity === filters.severity)
      .filter((finding) => filters.state === undefined || finding.state === filters.state)
      .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt))
      .map(copy);
  }

  async getLatestHealth(): Promise<HealthSnapshot | undefined> {
    const latest = this.health.toSorted((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
    return latest === undefined ? undefined : copy(latest);
  }

  async appendEvent(event: RunEvent): Promise<void> {
    this.events.push(copy(event));
  }

  async listEvents(runId: string): Promise<RunEvent[]> {
    return this.events.filter((event) => event.runId === runId).map(copy);
  }
}
