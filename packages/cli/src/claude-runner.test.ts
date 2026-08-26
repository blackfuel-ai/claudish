/**
 * Unit tests for the Claude Code command line: what reaches argv, and what a
 * command line too large for `posix_spawn` reports.
 */

import { describe, test, expect } from "bun:test";
import {
  ArgvTooLargeError,
  MAX_ARG_BYTES,
  assertArgvWithinLimit,
  buildClaudeArgs,
} from "./claude-runner.js";
import type { ClaudishConfig } from "./types.js";

const SETTINGS_PATH = "/mock/.claudish/settings-12345.json";

function makeConfig(overrides: Partial<ClaudishConfig> = {}): ClaudishConfig {
  return {
    autoApprove: false,
    dangerous: false,
    interactive: false,
    debug: false,
    logLevel: "info",
    quiet: true,
    jsonOutput: false,
    monitor: false,
    stdin: false,
    noLogs: false,
    diagMode: "off",
    claudeArgs: [],
    ...overrides,
  } as ClaudishConfig;
}

describe("buildClaudeArgs", () => {
  test("single-shot mode keeps a stdin prompt off the command line", () => {
    const config = makeConfig({
      stdin: true,
      stdinPrompt: "review this pull request",
      claudeArgs: ["--verbose", "--output-format", "stream-json"],
    });

    const args = buildClaudeArgs(config, SETTINGS_PATH);

    expect(args).toEqual([
      "--settings",
      SETTINGS_PATH,
      "-p",
      "--verbose",
      "--output-format",
      "stream-json",
    ]);
    expect(args).not.toContain("review this pull request");
  });

  test("a prompt far above the per-argument limit produces a small command line", () => {
    const config = makeConfig({
      stdin: true,
      stdinPrompt: "x".repeat(MAX_ARG_BYTES * 4),
    });

    const args = buildClaudeArgs(config, SETTINGS_PATH);

    expect(() => assertArgvWithinLimit(args)).not.toThrow();
    expect(args.join(" ").length).toBeLessThan(1024);
  });

  test("interactive mode forwards a positional prompt", () => {
    const config = makeConfig({
      interactive: true,
      claudeArgs: ["do the thing", "--add-dir", "/repo"],
    });

    const args = buildClaudeArgs(config, SETTINGS_PATH);

    expect(args).toEqual(["--settings", SETTINGS_PATH, "do the thing", "--add-dir", "/repo"]);
    expect(args).not.toContain("-p");
  });

  test("permission and output flags precede passthrough args", () => {
    const config = makeConfig({
      autoApprove: true,
      dangerous: true,
      jsonOutput: true,
      claudeArgs: ["--effort", "high"],
    });

    expect(buildClaudeArgs(config, SETTINGS_PATH)).toEqual([
      "--settings",
      SETTINGS_PATH,
      "-p",
      "--dangerously-skip-permissions",
      "--dangerouslyDisableSandbox",
      "--output-format",
      "json",
      "--effort",
      "high",
    ]);
  });
});

describe("assertArgvWithinLimit", () => {
  test("accepts an argument exactly at the limit", () => {
    expect(() => assertArgvWithinLimit(["x".repeat(MAX_ARG_BYTES)])).not.toThrow();
  });

  test("rejects an argument one byte over the limit", () => {
    expect(() => assertArgvWithinLimit(["x".repeat(MAX_ARG_BYTES + 1)])).toThrow(ArgvTooLargeError);
  });

  test("counts bytes, not characters", () => {
    // Two bytes per character, so half the limit in characters is at the limit
    // in bytes and one character more is over it.
    expect(() => assertArgvWithinLimit(["é".repeat(Math.floor(MAX_ARG_BYTES / 2) + 1)])).toThrow(
      ArgvTooLargeError
    );
  });

  test("names the offending argument, its size, and the limit", () => {
    const oversized = "x".repeat(MAX_ARG_BYTES + 7);

    expect(() => assertArgvWithinLimit(["--settings", "/tmp/s.json", oversized])).toThrow(
      new RegExp(`argument 2 is ${MAX_ARG_BYTES + 7} bytes.*${MAX_ARG_BYTES}-byte`)
    );
  });

  test("points at the stdin route past the limit", () => {
    expect(() => assertArgvWithinLimit(["x".repeat(MAX_ARG_BYTES + 1)])).toThrow(/--stdin prompt/);
  });

  test("accepts an ordinary command line", () => {
    expect(() =>
      assertArgvWithinLimit(["--settings", "/tmp/s.json", "-p", "--output-format", "json"])
    ).not.toThrow();
  });
});
