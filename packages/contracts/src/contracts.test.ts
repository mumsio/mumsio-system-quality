import { describe, expect, it } from "vitest";
import {
  CreateTestRunRequestSchema,
  NormalizedTestResultSchema,
  TestDefinitionSchema,
} from "./index.js";

describe("wire contracts", () => {
  it("accepts only the narrow create-run command", () => {
    expect(CreateTestRunRequestSchema.parse({ testType: "load", environment: "staging" })).toEqual({
      testType: "load",
      environment: "staging",
    });
    expect(() => CreateTestRunRequestSchema.parse({
      testType: "load",
      environment: "staging",
      url: "https://production.example",
    })).toThrow();
  });

  it("rejects invalid enums and unsafe definition shapes", () => {
    expect(() => CreateTestRunRequestSchema.parse({ testType: "shell", environment: "local" })).toThrow();
    expect(() => TestDefinitionSchema.parse({ type: "load" })).toThrow();
  });

  it("rejects malformed normalized provider output", () => {
    expect(() => NormalizedTestResultSchema.parse({
      schemaVersion: "1.0.0",
      testRunId: "run-1",
      status: "passed",
      overallScore: 101,
    })).toThrow();
  });
});
