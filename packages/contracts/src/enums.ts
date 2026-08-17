import { z } from "zod";

export const ADMIN_ROLES = ["owner", "admin", "sales", "support", "dev"] as const;
export const AdminRoleSchema = z.enum(ADMIN_ROLES);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

export const VIEWER_CAPABILITIES = [
  "quality:view",
  "quality:run",
  "quality:configure",
  "quality:wallboard:view",
] as const;
export const ViewerCapabilitySchema = z.enum(VIEWER_CAPABILITIES);
export type ViewerCapability = z.infer<typeof ViewerCapabilitySchema>;

export const TEST_TYPES = [
  "quick_health",
  "load",
  "stress",
  "spike",
  "soak",
  "security",
  "efficiency",
  "reliability",
  "performance",
  "full_system",
  "full_release",
] as const;
export const TestTypeSchema = z.enum(TEST_TYPES);
export type TestType = z.infer<typeof TestTypeSchema>;

export const ENVIRONMENTS = ["local", "staging", "production"] as const;
export const EnvironmentSchema = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const RUN_STATUSES = [
  "queued",
  "running",
  "passed",
  "warning",
  "failed",
  "cancelled",
] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const TEST_CATEGORIES = [
  "traffic",
  "non_functional",
  "combined",
] as const;
export const TestCategorySchema = z.enum(TEST_CATEGORIES);
export type TestCategory = z.infer<typeof TestCategorySchema>;

export const TEST_INTENSITIES = ["passive", "light", "moderate", "heavy"] as const;
export const TestIntensitySchema = z.enum(TEST_INTENSITIES);
export type TestIntensity = z.infer<typeof TestIntensitySchema>;

export const RUNNER_TYPES = ["mock", "github_actions"] as const;
export const RunnerTypeSchema = z.enum(RUNNER_TYPES);
export type RunnerType = z.infer<typeof RunnerTypeSchema>;

export const SYSTEM_IDS = [
  "supabase",
  "railway",
  "cloudflare_web",
  "mumsio_go_ios",
  "mumsio_go_android",
  "stripe",
  "telnyx",
] as const;
export const SystemIdSchema = z.enum(SYSTEM_IDS);
export type SystemId = z.infer<typeof SystemIdSchema>;

export const QUALITY_DIMENSIONS = [
  "performance",
  "reliability",
  "security",
  "efficiency",
  "release_quality",
] as const;
export const QualityDimensionSchema = z.enum(QUALITY_DIMENSIONS);
export type QualityDimension = z.infer<typeof QualityDimensionSchema>;

export const RESULT_STATUSES = ["passed", "warning", "failed"] as const;
export const ResultStatusSchema = z.enum(RESULT_STATUSES);
export type ResultStatus = z.infer<typeof ResultStatusSchema>;

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const FINDING_STATES = ["open", "accepted", "resolved", "false_positive"] as const;
export const FindingStateSchema = z.enum(FINDING_STATES);
export type FindingState = z.infer<typeof FindingStateSchema>;
