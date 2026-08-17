import type {
  DimensionScore,
  MetricScore,
  MetricValue,
  QualityDimension,
  ResultStatus,
} from "@mumsio/quality-contracts";

export const SCORING_VERSION = "1.0.0";

export interface MetricThreshold {
  readonly key: string;
  readonly dimension: QualityDimension;
  readonly direction: "min" | "max";
  readonly passAt: number;
  readonly failAt: number;
  readonly weight: number;
  readonly required: boolean;
  readonly hardGate?: (value: number) => boolean;
}

export const METRIC_THRESHOLDS: readonly MetricThreshold[] = [
  { key: "availability_ratio", dimension: "reliability", direction: "min", passAt: 0.995, failAt: 0.98, weight: 3, required: true, hardGate: (value: number) => value < 0.95 },
  { key: "error_rate_ratio", dimension: "reliability", direction: "max", passAt: 0.01, failAt: 0.03, weight: 2, required: true, hardGate: (value: number) => value > 0.05 },
  { key: "p95_response_ms", dimension: "performance", direction: "max", passAt: 350, failAt: 700, weight: 3, required: true },
  { key: "p99_response_ms", dimension: "performance", direction: "max", passAt: 650, failAt: 1_200, weight: 1, required: true },
  { key: "requests_per_second", dimension: "performance", direction: "min", passAt: 75, failAt: 40, weight: 1, required: true },
  { key: "security_critical_count", dimension: "security", direction: "max", passAt: 0, failAt: 1, weight: 4, required: true, hardGate: (value: number) => value > 0 },
  { key: "security_high_count", dimension: "security", direction: "max", passAt: 0, failAt: 2, weight: 2, required: true },
  { key: "resource_efficiency_ratio", dimension: "efficiency", direction: "min", passAt: 0.85, failAt: 0.7, weight: 2, required: true },
  { key: "release_regression_percent", dimension: "release_quality", direction: "max", passAt: 5, failAt: 20, weight: 2, required: true },
  { key: "release_error_rate_delta_percent", dimension: "release_quality", direction: "max", passAt: 10, failAt: 25, weight: 2, required: true },
];

const DIMENSION_WEIGHTS: Readonly<Record<QualityDimension, number>> = {
  performance: 3,
  reliability: 3,
  security: 3,
  efficiency: 2,
  release_quality: 2,
};

export interface ScoringSummary {
  readonly overallScore: number;
  readonly coverage: number;
  readonly status: ResultStatus;
  readonly metrics: readonly MetricScore[];
  readonly dimensions: readonly DimensionScore[];
  readonly missingRequiredMetrics: readonly string[];
  readonly hardGateFailures: readonly string[];
  readonly scoringVersion: typeof SCORING_VERSION;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function statusForScore(score: number): ResultStatus {
  if (score >= 85) return "passed";
  if (score >= 60) return "warning";
  return "failed";
}

function interpolateMetricScore(value: number, threshold: MetricThreshold): number {
  const good = threshold.direction === "min" ? value >= threshold.passAt : value <= threshold.passAt;
  if (good) return 100;

  const failed = threshold.direction === "min" ? value <= threshold.failAt : value >= threshold.failAt;
  const span = Math.abs(threshold.passAt - threshold.failAt);
  if (failed) {
    const overrun = threshold.direction === "min"
      ? threshold.failAt - value
      : value - threshold.failAt;
    return Math.max(0, 59 - (overrun / span) * 59);
  }

  const progressTowardFailure = threshold.direction === "min"
    ? (threshold.passAt - value) / span
    : (value - threshold.passAt) / span;
  return 100 - progressTowardFailure * 40;
}

export function scoreMetrics(values: readonly MetricValue[]): ScoringSummary {
  const valueByKey = new Map<string, MetricValue>();
  for (const metric of values) {
    if (valueByKey.has(metric.key)) {
      throw new Error(`Duplicate metric key: ${metric.key}`);
    }
    valueByKey.set(metric.key, metric);
  }

  const metrics: MetricScore[] = [];
  const missingRequiredMetrics: string[] = [];
  const hardGateFailures: string[] = [];
  let observedWeight = 0;
  let possibleWeight = 0;

  for (const threshold of METRIC_THRESHOLDS) {
    if (threshold.required) possibleWeight += threshold.weight;
    const metric = valueByKey.get(threshold.key);
    if (!metric) {
      if (threshold.required) missingRequiredMetrics.push(threshold.key);
      continue;
    }

    observedWeight += threshold.weight;
    const score = round(interpolateMetricScore(metric.value, threshold));
    metrics.push({ ...metric, dimension: threshold.dimension, score, status: statusForScore(score) });
    if (threshold.hardGate?.(metric.value)) hardGateFailures.push(threshold.key);
  }

  const dimensions: DimensionScore[] = [];
  for (const [dimension, dimensionWeight] of Object.entries(DIMENSION_WEIGHTS) as [QualityDimension, number][]) {
    const thresholds = METRIC_THRESHOLDS.filter((threshold) => threshold.dimension === dimension);
    const dimensionMetrics = metrics.filter((metric) => metric.dimension === dimension);
    const totalWeight = thresholds.reduce((sum, threshold) => sum + threshold.weight, 0);
    const coveredWeight = thresholds
      .filter((threshold) => valueByKey.has(threshold.key))
      .reduce((sum, threshold) => sum + threshold.weight, 0);
    if (coveredWeight === 0) continue;
    const score = round(dimensionMetrics.reduce((sum, metric) => {
      const threshold = thresholds.find((candidate) => candidate.key === metric.key);
      return sum + metric.score * (threshold?.weight ?? 0);
    }, 0) / coveredWeight);
    const coverage = round(coveredWeight / totalWeight);
    dimensions.push({ dimension, score, coverage, status: statusForScore(score) });
    void dimensionWeight;
  }

  const weightedDimensionTotal = dimensions.reduce(
    (sum, dimension) => sum + dimension.score * DIMENSION_WEIGHTS[dimension.dimension],
    0,
  );
  const includedDimensionWeight = dimensions.reduce(
    (sum, dimension) => sum + DIMENSION_WEIGHTS[dimension.dimension],
    0,
  );
  const coverage = possibleWeight === 0 ? 0 : round(observedWeight / possibleWeight);
  let overallScore = includedDimensionWeight === 0 ? 0 : weightedDimensionTotal / includedDimensionWeight;

  if (coverage < 0.6) overallScore = Math.min(overallScore, 59);
  else if (coverage < 0.8) overallScore = Math.min(overallScore, 84);
  if (hardGateFailures.length > 0) overallScore = Math.min(overallScore, 59);
  overallScore = round(overallScore);

  return {
    overallScore,
    coverage,
    status: statusForScore(overallScore),
    metrics,
    dimensions,
    missingRequiredMetrics,
    hardGateFailures,
    scoringVersion: SCORING_VERSION,
  };
}
