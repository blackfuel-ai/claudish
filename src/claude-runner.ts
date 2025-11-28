import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV } from "./config.js";
import type { ClaudishConfig } from "./types.js";

/**
 * Create a temporary settings file with custom status line for this instance
 * This ensures each Claudish instance has its own status line without affecting
 * global Claude Code settings or other running instances
 */
function createTempSettingsFile(modelDisplay: string, port: string): string {
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const tempPath = join(tempDir, `claudish-settings-${timestamp}.json`);

  // ANSI color codes for visual enhancement
  // Claude Code supports ANSI colors in status line output
  const CYAN = "\\033[96m";      // Bright cyan for directory (easy to read)
  const YELLOW = "\\033[93m";    // Bright yellow for model (highlights it's special)
  const GREEN = "\\033[92m";     // Bright green for cost (money = green)
  const MAGENTA = "\\033[95m";   // Bright magenta for context (attention-grabbing)
  const DIM = "\\033[2m";        // Dim for separator
  const RESET = "\\033[0m";      // Reset colors
  const BOLD = "\\033[1m";       // Bold text

  // Create ultra-compact status line optimized for thinking mode + cost + context tracking
  // Critical info: directory, model (actual OpenRouter ID), cost, context remaining
  // - Directory: where you are (truncated to 15 chars)
  // - Model: actual OpenRouter model ID
  // - Cost: real-time session cost from OpenRouter (via proxy)
  // - Context: percentage remaining (calculated dynamically by proxy using real API limits)
  //
  // CONTEXT TRACKING FIX: Read pre-calculated values from file written by proxy
  // Proxy fetches real context limit from OpenRouter API and writes percentage to file
  // File path: /tmp/claudish-tokens-{PORT}.json
  const tokenFilePath = `/tmp/claudish-tokens-${port}.json`;

  const settings = {
    statusLine: {
      type: "command",
      command: `JSON=$(cat) && DIR=$(basename "$(pwd)") && [ \${#DIR} -gt 15 ] && DIR="\${DIR:0:12}..." || true && CTX=100 && COST="0" && if [ -f "${tokenFilePath}" ]; then TOKENS=$(cat "${tokenFilePath}" 2>/dev/null) && REAL_COST=$(echo "$TOKENS" | grep -o '"total_cost":[0-9.]*' | cut -d: -f2) && REAL_CTX=$(echo "$TOKENS" | grep -o '"context_left_percent":[0-9]*' | grep -o '[0-9]*') && if [ ! -z "$REAL_COST" ]; then COST="$REAL_COST"; else COST=$(echo "$JSON" | grep -o '"total_cost_usd":[0-9.]*' | cut -d: -f2); fi && if [ ! -z "$REAL_CTX" ]; then CTX="$REAL_CTX"; fi; else COST=$(echo "$JSON" | grep -o '"total_cost_usd":[0-9.]*' | cut -d: -f2); fi && [ -z "$COST" ] && COST="0" || true && printf "${CYAN}${BOLD}%s${RESET} ${DIM}•${RESET} ${YELLOW}%s${RESET} ${DIM}•${RESET} ${GREEN}\\$%.3f${RESET} ${DIM}•${RESET} ${MAGENTA}%s%%${RESET}\\n" "$DIR" "$CLAUDISH_ACTIVE_MODEL_NAME" "$COST" "$CTX"`,
      padding: 0,
    },
  };

  writeFileSync(tempPath, JSON.stringify(settings, null, 2), "utf-8");
  return tempPath;
}

/**
 * Run Claude Code CLI with the proxy server
 */
export async function runClaudeWithProxy(
  config: ClaudishConfig,
  proxyUrl: string
): Promise<number> {
  // Use actual OpenRouter model ID (no translation)
  // This ensures ANY model works, not just our shortlist
  const modelId = config.model || "unknown";

  // Extract port from proxy URL for token file path
  const portMatch = proxyUrl.match(/:(\d+)/);
  const port = portMatch ? portMatch[1] : "unknown";

  // Create temporary settings file with custom status line for this instance
  const tempSettingsPath = createTempSettingsFile(modelId, port);

  // Build claude arguments
  const claudeArgs: string[] = [];

  // Add settings file flag first (applies to this instance only)
  claudeArgs.push("--settings", tempSettingsPath);

  // Interactive mode - no automatic arguments
  if (config.interactive) {
    // In interactive mode, add permission skip if enabled
    if (config.autoApprove) {
      claudeArgs.push("--dangerously-skip-permissions");
    }
    if (config.dangerous) {
      claudeArgs.push("--dangerouslyDisableSandbox");
    }
  } else {
    // Single-shot mode - add all arguments
    // Add -p flag FIRST to enable headless/print mode (non-interactive, exits after task)
    claudeArgs.push("-p");
    if (config.autoApprove) {
      claudeArgs.push("--dangerously-skip-permissions");
    }
    if (config.dangerous) {
      claudeArgs.push("--dangerouslyDisableSandbox");
    }
    // Add JSON output format if requested
    if (config.jsonOutput) {
      claudeArgs.push("--output-format", "json");
    }
    // If agent is specified, prepend agent instruction to the prompt
    if (config.agent && config.claudeArgs.length > 0) {
      // Prepend agent context to the first argument (the prompt)
      // This tells Claude Code to use the specified agent for the task
      // Claude Code agents use @agent- prefix format
      const modifiedArgs = [...config.claudeArgs];
      const agentId = config.agent.startsWith("@agent-") ? config.agent : `@agent-${config.agent}`;
      modifiedArgs[0] = `Use the ${agentId} agent to: ${modifiedArgs[0]}`;
      claudeArgs.push(...modifiedArgs);
    } else {
      // Add user-provided args as-is (including prompt)
      claudeArgs.push(...config.claudeArgs);
    }
  }

  // Environment variables for Claude Code
  const env: Record<string, string> = {
    ...process.env,
    // Point Claude Code to our local proxy
    ANTHROPIC_BASE_URL: proxyUrl,
    // Set active model ID for status line (actual OpenRouter model ID)
    [ENV.CLAUDISH_ACTIVE_MODEL_NAME]: modelId,
    // Set Claude Code standard model environment variables
    // Both ANTHROPIC_MODEL and ANTHROPIC_SMALL_FAST_MODEL point to the same model
    // since we're proxying everything through OpenRouter
    [ENV.ANTHROPIC_MODEL]: modelId,
    [ENV.ANTHROPIC_SMALL_FAST_MODEL]: modelId,
  };

  // Handle API key based on mode
  if (config.monitor) {
    // Monitor mode: Don't set ANTHROPIC_API_KEY at all
    // This allows Claude Code to use its native authentication
    // Delete any placeholder keys from environment
    delete env.ANTHROPIC_API_KEY;
  } else {
    // OpenRouter mode: Use placeholder to prevent Claude Code dialog
    // The proxy will handle authentication with OPENROUTER_API_KEY
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-ant-api03-placeholder-not-used-proxy-handles-auth-with-openrouter-key-xxxxxxxxxxxxxxxxxxxxx";
  }

  // Helper function to log messages (respects quiet flag)
  const log = (message: string) => {
    if (!config.quiet) {
      console.log(message);
    }
  };

  if (config.interactive) {
    log(`\n[claudish] Model: ${modelId}\n`);
  } else {
    log(`\n[claudish] Model: ${modelId}`);
    log(`[claudish] Arguments: ${claudeArgs.join(" ")}\n`);
  }

  // Spawn claude CLI process using Node.js child_process (works on both Node.js and Bun)
  const proc = spawn("claude", claudeArgs, {
    env,
    stdio: "inherit", // Stream stdin/stdout/stderr to parent
  });

  // Handle process termination signals (includes cleanup)
  setupSignalHandlers(proc, tempSettingsPath, config.quiet);

  // Wait for claude to exit
  const exitCode = await new Promise<number>((resolve) => {
    proc.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });

  // Clean up temporary settings file
  try {
    unlinkSync(tempSettingsPath);
  } catch (error) {
    // Ignore cleanup errors
  }

  return exitCode;
}

/**
 * Setup signal handlers to gracefully shutdown
 */
function setupSignalHandlers(proc: ChildProcess, tempSettingsPath: string, quiet: boolean): void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

  for (const signal of signals) {
    process.on(signal, () => {
      if (!quiet) {
        console.log(`\n[claudish] Received ${signal}, shutting down...`);
      }
      proc.kill();
      // Clean up temp settings file
      try {
        unlinkSync(tempSettingsPath);
      } catch {
        // Ignore cleanup errors
      }
      process.exit(0);
    });
  }
}

/**
 * Check if Claude Code CLI is installed
 */
export async function checkClaudeInstalled(): Promise<boolean> {
  try {
    const proc = spawn("which", ["claude"], {
      stdio: "ignore",
    });

    const exitCode = await new Promise<number>((resolve) => {
      proc.on("exit", (code) => {
        resolve(code ?? 1);
      });
    });

    return exitCode === 0;
  } catch {
    return false;
  }
}
