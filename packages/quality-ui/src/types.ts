export type QualityEnvironment = "local" | "staging" | "production";
export type RunStatus = "queued" | "running" | "passed" | "warning" | "failed" | "cancelled";
export type TestType =
  | "quick_health"
  | "load"
  | "stress"
  | "spike"
  | "soak"
  | "security"
  | "efficiency"
  | "reliability"
  | "performance"
  | "full_system"
  | "full_release";

export interface QualityCapabilities {
  view: boolean;
  run: boolean;
  configure: boolean;
  wallboardView: boolean;
}

export interface Metric {
  label: string;
  value: string;
  comparison?: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  status: RunStatus | "unknown";
  change?: number;
  icon?: string;
}

export interface TestDefinition {
  testType: TestType;
  name: string;
  description: string;
  category: "traffic" | "non_functional" | "combined";
  icon?: string;
  enabled: boolean;
  allowedEnvironments: QualityEnvironment[];
  disabledReason?: string;
  estimatedDuration?: string;
  intensity?: "passive" | "light" | "moderate" | "heavy";
}

export interface TestRun {
  id: string;
  testType: TestType;
  displayName: string;
  environment: QualityEnvironment;
  status: RunStatus;
  score?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: string;
  progress?: number;
  metrics?: Metric[];
  release?: string;
  summary?: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  source: string;
  system: string;
  status: "open" | "acknowledged" | "resolved";
  detectedAt: string;
  description?: string;
  recommendation?: string;
}

export interface ReleaseComparison {
  base: { version: string; date: string; score: number };
  current: { version: string; date: string; score: number };
  metrics: Array<{ label: string; base: string; current: string; change: number; lowerIsBetter?: boolean }>;
}

export interface QualityAlert {
  id: string;
  title: string;
  severity: "warning" | "info" | "critical";
  occurredAt: string;
  release?: string;
}

export interface DashboardData {
  generatedAt: string;
  hasData: boolean;
  overallScore: number;
  trend: number[];
  scoreChange?: number;
  dimensions: DimensionScore[];
  systems: Array<{ id: string; name: string; score?: number; status: "operational" | "degraded" | "down" | "unknown" }>;
  latestRun?: TestRun;
  recentRuns: TestRun[];
  findings: Finding[];
  releaseComparison?: ReleaseComparison;
  alerts: QualityAlert[];
  capabilities: QualityCapabilities;
}

export interface WallboardData {
  generatedAt: string;
  overallScore: number;
  status: RunStatus;
  dimensions: DimensionScore[];
  systems: Array<{ id: string; name: string; status: "operational" | "degraded" | "down" | "unknown"; response?: string }>;
  latestRun?: Pick<TestRun, "displayName" | "environment" | "status" | "score" | "completedAt">;
  activeRun?: Pick<TestRun, "displayName" | "environment" | "status" | "progress">;
  openFindings: { critical: number; high: number; medium: number; low: number };
}

export interface HistoryResponse {
  items: TestRun[];
  total: number;
}

export interface FindingsResponse {
  items: Finding[];
  totals: Record<"critical" | "high" | "medium" | "low" | "info", number>;
}

export interface ConfigurationData {
  catalogVersion: string;
  policyVersion: string;
  adapters: Array<{ name: string; value: string; state: "active" | "inactive" | "planned" }>;
  features: Array<{ name: string; enabled: boolean; description: string }>;
  capabilities: QualityCapabilities;
}
