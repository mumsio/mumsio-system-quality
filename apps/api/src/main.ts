import { createApiRuntime, readConfiguration } from "./app.js";

const configuration = readConfiguration();
const runtime = createApiRuntime(configuration);
const port = readPort(process.env.PORT ?? process.env.QUALITY_API_PORT);
const host = readHost(process.env.QUALITY_API_HOST);
const server = runtime.app.listen(port, host, () => {
  console.log(`Mumsio Quality API listening on http://${host}:${port} (${configuration.nodeEnv})`);
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await runtime.close();
    process.exitCode = 0;
  });
}

function readHost(value: string | undefined): string {
  const host = value ?? "127.0.0.1";
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error("QUALITY_API_HOST is invalid");
  return host;
}

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

function readPort(value: string | undefined): number {
  if (value === undefined) return 4100;
  if (!/^\d+$/.test(value)) throw new Error("PORT must be an integer");
  const parsed = Number(value);
  if (parsed < 1 || parsed > 65_535) throw new Error("PORT must be between 1 and 65535");
  return parsed;
}
