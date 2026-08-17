import { onBeforeUnmount, ref, type Ref } from "vue";

export type ConnectionState = "loading" | "fresh" | "stale" | "reconnecting" | "error";

export interface ResourceState<T> {
  data: Ref<T | undefined>;
  error: Ref<string | undefined>;
  state: Ref<ConnectionState>;
  lastUpdated: Ref<Date | undefined>;
  load: (background?: boolean) => Promise<void>;
  stop: () => void;
}

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>): ResourceState<T> {
  const data = ref<T>();
  const error = ref<string>();
  const state = ref<ConnectionState>("loading");
  const lastUpdated = ref<Date>();
  let controller: AbortController | undefined;

  async function load(background = false): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    error.value = undefined;
    state.value = background && data.value ? "reconnecting" : "loading";
    try {
      data.value = await loader(controller.signal);
      lastUpdated.value = new Date();
      state.value = "fresh";
    } catch (cause) {
      if (controller.signal.aborted) return;
      error.value = cause instanceof Error ? cause.message : "Unable to load quality data";
      state.value = data.value ? "stale" : "error";
    }
  }

  function stop(): void { controller?.abort(); }
  onBeforeUnmount(stop);
  return { data, error, state, lastUpdated, load, stop };
}

export function startPolling(callback: () => void, intervalMs: number): () => void {
  const timer = window.setInterval(callback, intervalMs);
  return () => window.clearInterval(timer);
}

export function formatRelativeTime(input?: string | Date): string {
  if (!input) return "Never";
  const time = input instanceof Date ? input : new Date(input);
  const seconds = Math.round((time.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 45) return "just now";
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

export function formatDate(input?: string): string {
  if (!input) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(input));
}

export function createIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
