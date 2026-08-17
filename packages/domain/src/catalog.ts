import type {
  CatalogItem,
  Environment,
  TestDefinition,
  TestType,
} from "@mumsio/quality-contracts";

export const TEST_CATALOG_VERSION = "1.0.0";

export const TEST_CATALOG: readonly TestDefinition[] = [
  {
    type: "quick_health",
    version: "1.0.0",
    title: "Quick Health Check",
    description: "Read-only availability and dependency health checks.",
    category: "non_functional",
    intensity: "passive",
    runnerType: "mock",
    targets: ["supabase", "railway", "cloudflare_web"],
    allowedEnvironments: ["local", "staging", "production"],
    timeoutSeconds: 120,
    safetyLimits: { maxDurationSeconds: 120, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "load",
    version: "1.0.0",
    title: "Load Test",
    description: "Capped normal-load profile against allowlisted application routes.",
    category: "traffic",
    intensity: "moderate",
    runnerType: "mock",
    targets: ["railway", "cloudflare_web"],
    allowedEnvironments: ["local", "staging", "production"],
    timeoutSeconds: 900,
    safetyLimits: { maxDurationSeconds: 900, maxVirtualUsers: 100, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "stress",
    version: "1.0.0",
    title: "Stress Test",
    description: "Finds capacity limits using a bounded increasing traffic profile.",
    category: "traffic",
    intensity: "heavy",
    runnerType: "mock",
    targets: ["railway", "cloudflare_web"],
    allowedEnvironments: ["local", "staging"],
    timeoutSeconds: 1_200,
    safetyLimits: { maxDurationSeconds: 1_200, maxVirtualUsers: 300, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "spike",
    version: "1.0.0",
    title: "Spike Test",
    description: "Measures recovery from a short, bounded traffic surge.",
    category: "traffic",
    intensity: "heavy",
    runnerType: "mock",
    targets: ["railway", "cloudflare_web"],
    allowedEnvironments: ["local", "staging"],
    timeoutSeconds: 600,
    safetyLimits: { maxDurationSeconds: 600, maxVirtualUsers: 300, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "soak",
    version: "1.0.0",
    title: "Soak Test",
    description: "Detects degradation during a long-running bounded load.",
    category: "traffic",
    intensity: "heavy",
    runnerType: "mock",
    targets: ["railway", "supabase"],
    allowedEnvironments: ["local", "staging"],
    timeoutSeconds: 14_400,
    safetyLimits: { maxDurationSeconds: 14_400, maxVirtualUsers: 100, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "security",
    version: "1.0.0",
    title: "Security Scan",
    description: "Passive header and known-exposure checks with sanitized findings.",
    category: "non_functional",
    intensity: "passive",
    runnerType: "mock",
    targets: ["cloudflare_web", "railway"],
    allowedEnvironments: ["local", "staging", "production"],
    timeoutSeconds: 600,
    safetyLimits: { maxDurationSeconds: 600, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "efficiency",
    version: "1.0.0",
    title: "Efficiency Check",
    description: "Read-only resource and request efficiency assessment.",
    category: "non_functional",
    intensity: "passive",
    runnerType: "mock",
    targets: ["railway", "supabase"],
    allowedEnvironments: ["local", "staging", "production"],
    timeoutSeconds: 300,
    safetyLimits: { maxDurationSeconds: 300, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "reliability",
    version: "1.0.0",
    title: "Reliability Check",
    description: "Read-only success-rate and dependency availability assessment.",
    category: "non_functional",
    intensity: "passive",
    runnerType: "mock",
    targets: ["supabase", "railway", "cloudflare_web"],
    allowedEnvironments: ["local", "staging", "production"],
    timeoutSeconds: 300,
    safetyLimits: { maxDurationSeconds: 300, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "performance",
    version: "1.0.0",
    title: "Performance Check",
    description: "Lightweight latency and throughput checks on allowlisted routes.",
    category: "non_functional",
    intensity: "light",
    runnerType: "mock",
    targets: ["railway", "cloudflare_web"],
    allowedEnvironments: ["local", "staging", "production"],
    timeoutSeconds: 300,
    safetyLimits: { maxDurationSeconds: 300, maxVirtualUsers: 10, readOnly: true },
    composition: [],
    enabled: true,
  },
  {
    type: "full_system",
    version: "1.0.0",
    title: "Full System Test",
    description: "Runs the approved non-production system test composition.",
    category: "combined",
    intensity: "heavy",
    runnerType: "mock",
    targets: ["supabase", "railway", "cloudflare_web", "mumsio_go_ios", "mumsio_go_android"],
    allowedEnvironments: ["local", "staging"],
    timeoutSeconds: 3_600,
    safetyLimits: { maxDurationSeconds: 3_600, maxVirtualUsers: 100, readOnly: true },
    composition: ["quick_health", "load", "security", "efficiency", "reliability", "performance"],
    enabled: true,
  },
  {
    type: "full_release",
    version: "1.0.0",
    title: "Full Release Test",
    description: "Reserved release-gate composition; disabled until explicitly configured.",
    category: "combined",
    intensity: "heavy",
    runnerType: "mock",
    targets: ["supabase", "railway", "cloudflare_web", "mumsio_go_ios", "mumsio_go_android"],
    allowedEnvironments: ["local", "staging"],
    timeoutSeconds: 7_200,
    safetyLimits: { maxDurationSeconds: 7_200, maxVirtualUsers: 100, readOnly: true },
    composition: ["full_system"],
    enabled: false,
  },
];

const catalogByType = new Map<TestType, TestDefinition>(
  TEST_CATALOG.map((definition) => [definition.type, definition]),
);

export function getTestDefinition(type: TestType): TestDefinition {
  const definition = catalogByType.get(type);
  if (!definition) {
    throw new Error(`Unknown test definition: ${type}`);
  }
  return definition;
}

export function toCatalogItem(
  definition: TestDefinition,
  isAvailable: (environment: Environment) => boolean = (environment) =>
    definition.enabled && definition.allowedEnvironments.includes(environment),
): CatalogItem {
  const { safetyLimits: _serverOnly, ...displaySafe } = definition;
  return {
    ...displaySafe,
    availability: {
      local: isAvailable("local"),
      staging: isAvailable("staging"),
      production: isAvailable("production"),
    },
  };
}

export function getCatalogProjection(): readonly CatalogItem[] {
  return TEST_CATALOG.map((definition) => toCatalogItem(definition));
}
