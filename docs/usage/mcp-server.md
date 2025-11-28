# MCP Server Mode

**Use OpenRouter models as tools inside Claude Code.**

Claudish isn't just a CLI. It's also an MCP server that exposes external AI models as tools.

What does this mean? Claude can call Grok, GPT-5, or Gemini mid-conversation to get a second opinion, run a comparison, or delegate specialized tasks.

---

## Quick Setup

**1. Add to your Claude Code MCP settings:**

```json
{
  "mcpServers": {
    "claudish": {
      "command": "claudish",
      "args": ["--mcp"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-your-key-here"
      }
    }
  }
}
```

**2. Restart Claude Code**

**3. Use it:**
```
Ask Grok to review this function
```

Claude will use the `run_prompt` tool to call Grok.

---

## Available Tools

### `run_prompt`

Run a prompt through any OpenRouter model.

**Parameters:**
- `model` (required) - OpenRouter model ID. Must be specified explicitly.
- `prompt` (required) - The prompt to send
- `system_prompt` (optional) - System prompt for context
- `max_tokens` (optional) - Max response length (default: 4096)

**Model IDs:**
| Common Name | Model ID |
|-------------|----------|
| Grok | `x-ai/grok-code-fast-1` |
| GPT-5 Codex | `openai/gpt-5.1-codex` |
| Gemini 3 Pro | `google/gemini-3-pro-preview` |
| MiniMax M2 | `minimax/minimax-m2` |
| GLM 4.6 | `z-ai/glm-4.6` |
| Qwen3 VL | `qwen/qwen3-vl-235b-a22b-instruct` |

**Example usage:**
```
Ask Grok to review this function
→ run_prompt(model: "x-ai/grok-code-fast-1", prompt: "Review this function...")

Use GPT-5 Codex to explain the error
→ run_prompt(model: "openai/gpt-5.1-codex", prompt: "Explain this error...")
```

**Tip:** Use `list_models` first to see all available models with pricing.

---

### `list_models`

List recommended models with pricing and capabilities.

**Parameters:** None

**Returns:** Table of curated models with:
- Model ID
- Provider
- Pricing (per 1M tokens)
- Context window
- Capabilities (Tools, Reasoning, Vision)

---

### `search_models`

Search all OpenRouter models.

**Parameters:**
- `query` (required) - Search term (name, provider, capability)
- `limit` (optional) - Max results (default: 10)

**Example:**
```
Search for models with "vision" capability
```

---

### `compare_models`

Run the same prompt through multiple models and compare.

**Parameters:**
- `models` (required) - Array of model IDs
- `prompt` (required) - The prompt to compare
- `system_prompt` (optional) - System prompt

**Example:**
```
Compare responses from Grok, GPT-5, and Gemini for: "Explain this regex"
```

---

## Use Cases

### Get a Second Opinion

You're working with Claude, but want GPT-5's take:

```
Claude, use GPT-5 Codex to review the error handling in this function
```

### Specialized Tasks

Some models excel at specific things:

```
Use Gemini 3 Pro (it has 1M context) to analyze this entire codebase
```

### Multi-Model Validation

Before making big changes:

```
Compare what Grok, GPT-5, and Gemini think about this architecture decision
```

### Budget Optimization

Route simple tasks to cheap models:

```
Use MiniMax M2 to generate basic boilerplate for these interfaces
```

---

## Configuration

### Environment Variables

The MCP server reads `OPENROUTER_API_KEY` from environment.

**In Claude Code settings:**
```json
{
  "mcpServers": {
    "claudish": {
      "command": "claudish-mcp",
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-..."
      }
    }
  }
}
```

**Or export globally:**
```bash
export OPENROUTER_API_KEY='sk-or-v1-...'
```

### Using npx (No Install)

```json
{
  "mcpServers": {
    "claudish": {
      "command": "npx",
      "args": ["claudish@latest", "--mcp"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-..."
      }
    }
  }
}
```

---

## How It Works

```
┌─────────────┐     MCP Protocol      ┌─────────────┐     HTTP      ┌─────────────┐
│ Claude Code │ ◄──────────────────► │   Claudish  │ ◄───────────► │ OpenRouter  │
│             │     (stdio)           │  MCP Server │               │    API      │
└─────────────┘                       └─────────────┘               └─────────────┘
```

1. Claude Code sends tool call via MCP (stdio)
2. Claudish MCP server receives it
3. Server calls OpenRouter API
4. Response returned to Claude Code

---

## CLI vs MCP: When to Use Which

| Use Case | Mode | Why |
|----------|------|-----|
| Full alternative session | CLI | Replace Claude entirely |
| Get second opinion | MCP | Quick tool call mid-conversation |
| Batch automation | CLI | Scripts and pipelines |
| Model comparison | MCP | Easy multi-model comparison |
| Interactive coding | CLI | Full Claude Code experience |
| Specialized subtask | MCP | Delegate to expert model |

---

## Debugging

**Check if MCP server starts:**
```bash
OPENROUTER_API_KEY=sk-or-v1-... claudish --mcp
# Should output: [claudish] MCP server started
```

**Test the tools:**
Use Claude Code and ask it to list available MCP tools. You should see `run_prompt`, `list_models`, `search_models`, and `compare_models`.

---

## Limitations

**Streaming:** MCP tools don't stream. You get the full response when complete.

**Context:** The MCP tool doesn't share Claude Code's context. You need to pass relevant info in the prompt.

**Rate limits:** OpenRouter has rate limits. Heavy parallel usage might hit them.

---

## Next

- **[CLI Interactive Mode](interactive-mode.md)** - Full session replacement
- **[Model Selection](../models/choosing-models.md)** - Pick the right model
