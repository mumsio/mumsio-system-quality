import { inject, type App, type InjectionKey } from "vue";
import type { QualityApi } from "./api";

export const qualityApiKey: InjectionKey<QualityApi> = Symbol("mumsio-quality-api");

export function installQualityUi(app: App, api: QualityApi): void {
  app.provide(qualityApiKey, api);
}

export function useQualityApi(): QualityApi {
  const api = inject(qualityApiKey);
  if (!api) throw new Error("Quality API was not provided. Call installQualityUi(app, api).");
  return api;
}
