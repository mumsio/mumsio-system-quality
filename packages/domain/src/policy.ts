import type {
  ActorContext,
  AdminRole,
  Environment,
  TestDefinition,
  TestType,
} from "@mumsio/quality-contracts";
import { roleHasCapability } from "./authorization.js";

export interface ActiveRunSummary {
  readonly id: string;
  readonly environment: Environment;
  readonly intensity: TestDefinition["intensity"];
  readonly status: "queued" | "running";
}

export interface ServerPolicyConfig {
  readonly version: string;
  readonly enabledEnvironments: readonly Environment[];
  readonly productionEnabledTests: readonly TestType[];
  readonly productionRunnerRoles: readonly AdminRole[];
}

export const DEFAULT_SERVER_POLICY: ServerPolicyConfig = {
  version: "1.0.0",
  enabledEnvironments: ["local", "staging", "production"],
  productionEnabledTests: [
    "quick_health",
    "security",
    "efficiency",
    "reliability",
    "performance",
  ],
  productionRunnerRoles: ["owner", "admin"],
};

export type PolicyDenialCode =
  | "missing_capability"
  | "definition_disabled"
  | "environment_disabled"
  | "environment_not_allowed"
  | "production_role_denied"
  | "production_test_denied"
  | "production_heavy_test_denied"
  | "heavy_test_conflict";

export type PolicyDecision =
  | { readonly allowed: true; readonly code: "allowed"; readonly policyVersion: string }
  | {
      readonly allowed: false;
      readonly code: PolicyDenialCode;
      readonly reason: string;
      readonly policyVersion: string;
    };

export interface TestExecutionPolicyInput {
  readonly actor: ActorContext;
  readonly definition: TestDefinition;
  readonly environment: Environment;
  readonly activeRuns: readonly ActiveRunSummary[];
  readonly serverPolicy?: ServerPolicyConfig;
}

const HARD_DENIED_PRODUCTION_TESTS = ["stress", "spike", "soak"] as const satisfies readonly TestType[];

function deny(
  code: PolicyDenialCode,
  reason: string,
  policyVersion: string,
): PolicyDecision {
  return { allowed: false, code, reason, policyVersion };
}

export function evaluateTestExecutionPolicy(input: TestExecutionPolicyInput): PolicyDecision {
  const policy = input.serverPolicy ?? DEFAULT_SERVER_POLICY;
  const { actor, definition, environment } = input;

  if (!roleHasCapability(actor.role, "quality:run")) {
    return deny("missing_capability", "Your role cannot run Quality Center tests.", policy.version);
  }
  if (!definition.enabled) {
    return deny("definition_disabled", "This test is currently disabled.", policy.version);
  }
  if (!policy.enabledEnvironments.includes(environment)) {
    return deny("environment_disabled", "Testing is disabled for this environment.", policy.version);
  }
  if (!definition.allowedEnvironments.includes(environment)) {
    return deny("environment_not_allowed", "This test is not approved for the selected environment.", policy.version);
  }

  if (environment === "production") {
    if (HARD_DENIED_PRODUCTION_TESTS.includes(definition.type as (typeof HARD_DENIED_PRODUCTION_TESTS)[number])) {
      return deny(
        "production_heavy_test_denied",
        "Stress, spike, and soak tests are never permitted in production.",
        policy.version,
      );
    }
    if (!policy.productionRunnerRoles.includes(actor.role)) {
      return deny("production_role_denied", "Your role cannot start production tests.", policy.version);
    }
    if (!policy.productionEnabledTests.includes(definition.type)) {
      return deny("production_test_denied", "This test has not been explicitly enabled for production.", policy.version);
    }
  }

  if (
    definition.intensity === "heavy" &&
    input.activeRuns.some((run) => run.environment === environment && run.intensity === "heavy")
  ) {
    return deny(
      "heavy_test_conflict",
      "Another heavy test is already queued or running in this environment.",
      policy.version,
    );
  }

  return { allowed: true, code: "allowed", policyVersion: policy.version };
}
