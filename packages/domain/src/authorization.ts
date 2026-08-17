import type { AdminRole, ViewerCapability } from "@mumsio/quality-contracts";

const ALL_CAPABILITIES = [
  "quality:view",
  "quality:run",
  "quality:configure",
  "quality:wallboard:view",
] as const satisfies readonly ViewerCapability[];

const ROLE_CAPABILITIES = {
  owner: ALL_CAPABILITIES,
  admin: ALL_CAPABILITIES,
  dev: ["quality:view", "quality:run", "quality:wallboard:view"],
  sales: [],
  support: [],
} as const satisfies Record<AdminRole, readonly ViewerCapability[]>;

export function capabilitiesForRole(role: AdminRole): readonly ViewerCapability[] {
  return ROLE_CAPABILITIES[role];
}

export function roleHasCapability(role: AdminRole, capability: ViewerCapability): boolean {
  return ROLE_CAPABILITIES[role].some((candidate) => candidate === capability);
}

export function hasCapability(
  capabilities: readonly ViewerCapability[],
  capability: ViewerCapability,
): boolean {
  return capabilities.includes(capability);
}
