import { z } from "zod";
import {
  AdminRoleSchema,
  EnvironmentSchema,
  FindingStateSchema,
  QualityDimensionSchema,
  ResultStatusSchema,
  RunStatusSchema,
  RunnerTypeSchema,
  SeveritySchema,
  SystemIdSchema,
  TestCategorySchema,
  TestIntensitySchema,
  TestTypeSchema,
  ViewerCapabilitySchema,
} from "./enums.js";

const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const IdSchema = z.string().trim().min(1).max(200);

export const ActorContextSchema = z.strictObject({
  userId: IdSchema,
  displayName: z.string().trim().min(1).max(120),
  role: AdminRoleSchema,
});
export type ActorContext = z.infer<typeof ActorContextSchema>;

export const CapabilityProjectionSchema = z.strictObject({
  capabilities: z.array(ViewerCapabilitySchema),
});
export type CapabilityProjection = z.infer<typeof CapabilityProjectionSchema>;

export const TestSafetyLimitsSchema = z.strictObject({
  maxDurationSeconds: z.number().int().positive().max(86_400),
  maxVirtualUsers: z.number().int().positive().max(100_000).optional(),
  readOnly: z.boolean(),
});
export type TestSafetyLimits = z.infer<typeof TestSafetyLimitsSchema>;

export const TestDefinitionSchema = z.strictObject({
  type: TestTypeSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  category: TestCategorySchema,
  intensity: TestIntensitySchema,
  runnerType: RunnerTypeSchema,
  targets: z.array(SystemIdSchema).min(1),
  allowedEnvironments: z.array(EnvironmentSchema).min(1),
  timeoutSeconds: z.number().int().positive().max(86_400),
  safetyLimits: TestSafetyLimitsSchema,
  composition: z.array(TestTypeSchema).default([]),
  enabled: z.boolean(),
});
export type TestDefinition = z.infer<typeof TestDefinitionSchema>;

export const CatalogItemSchema = TestDefinitionSchema.omit({ safetyLimits: true }).extend({
  availability: z.record(EnvironmentSchema, z.boolean()),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CreateTestRunRequestSchema = z.strictObject({
  testType: TestTypeSchema,
  environment: EnvironmentSchema,
});
export type CreateTestRunRequest = z.infer<typeof CreateTestRunRequestSchema>;

export const TestRunSchema = z.strictObject({
  id: IdSchema,
  testType: TestTypeSchema,
  environment: EnvironmentSchema,
  status: RunStatusSchema,
  requestedByUserId: IdSchema,
  testDefinitionVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  startedAt: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
});
export type TestRun = z.infer<typeof TestRunSchema>;

export const MetricValueSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(24),
});
export type MetricValue = z.infer<typeof MetricValueSchema>;

export const MetricScoreSchema = MetricValueSchema.extend({
  dimension: QualityDimensionSchema,
  score: z.number().min(0).max(100),
  status: ResultStatusSchema,
});
export type MetricScore = z.infer<typeof MetricScoreSchema>;

export const DimensionScoreSchema = z.strictObject({
  dimension: QualityDimensionSchema,
  score: z.number().min(0).max(100),
  coverage: z.number().min(0).max(1),
  status: ResultStatusSchema,
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

export const SecurityFindingSchema = z.strictObject({
  id: IdSchema,
  fingerprint: z.string().trim().min(1).max(200),
  severity: SeveritySchema,
  source: z.string().trim().min(1).max(80),
  system: SystemIdSchema,
  endpoint: z.string().trim().max(500).nullable(),
  description: z.string().trim().min(1).max(2_000),
  state: FindingStateSchema,
  detectedAt: IsoDateTimeSchema,
});
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const NormalizedTestResultSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  testRunId: IdSchema,
  status: ResultStatusSchema,
  overallScore: z.number().min(0).max(100),
  coverage: z.number().min(0).max(1),
  metrics: z.array(MetricScoreSchema),
  dimensions: z.array(DimensionScoreSchema),
  findings: z.array(SecurityFindingSchema),
  recommendations: z.array(z.string().trim().min(1).max(500)),
  rawReference: z.string().trim().max(500).nullable(),
  calculatedAt: IsoDateTimeSchema,
  scoringVersion: z.string().min(1),
});
export type NormalizedTestResult = z.infer<typeof NormalizedTestResultSchema>;

export const SystemHealthSnapshotSchema = z.strictObject({
  id: IdSchema,
  overallScore: z.number().min(0).max(100),
  status: ResultStatusSchema,
  coverage: z.number().min(0).max(1),
  dimensions: z.array(DimensionScoreSchema),
  capturedAt: IsoDateTimeSchema,
  freshUntil: IsoDateTimeSchema,
});
export type SystemHealthSnapshot = z.infer<typeof SystemHealthSnapshotSchema>;

export const WallboardSnapshotSchema = z.strictObject({
  overallScore: z.number().min(0).max(100),
  status: ResultStatusSchema,
  coverage: z.number().min(0).max(1),
  dimensions: z.array(DimensionScoreSchema),
  latestRun: z.strictObject({
    testType: TestTypeSchema,
    environment: EnvironmentSchema,
    status: RunStatusSchema,
    completedAt: IsoDateTimeSchema.nullable(),
  }).nullable(),
  openFindingCounts: z.record(SeveritySchema, z.number().int().nonnegative()),
  capturedAt: IsoDateTimeSchema,
  freshUntil: IsoDateTimeSchema,
});
export type WallboardSnapshot = z.infer<typeof WallboardSnapshotSchema>;
