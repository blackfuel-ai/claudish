# Thinking Translation Model Alignment Summary

**Last Updated:** 2025-11-25
**Status:** Verification Complete ✅

## Overview

We have implemented a comprehensive **Thinking Translation Model** that aligns Claude Code's native `thinking.budget_tokens` parameter with the diverse reasoning configurations of 6 major AI providers. This ensures that when a user requests a specific thinking budget (e.g., "Think for 16k tokens"), it is correctly translated into the native control mechanism for the target model.

## Provider Alignment Matrix

| Provider | Model | Claude Parameter | Translated Parameter | Logic |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | o1, o3 | `budget_tokens` | `reasoning_effort` | < 4k: `minimal`<br>4k-16k: `low`<br>16k-32k: `medium`<br>> 32k: `high` |
| **Google** | Gemini 3.0 | `budget_tokens` | `thinking_level` | < 16k: `low`<br>>= 16k: `high` |
| **Google** | Gemini 2.5/2.0 | `budget_tokens` | `thinking_config.thinking_budget` | Passes exact budget (capped at 24,576) |
| **xAI** | Grok 3 Mini | `budget_tokens` | `reasoning_effort` | < 20k: `low`<br>>= 20k: `high` |
| **Qwen** | Qwen 2.5/3 | `budget_tokens` | `enable_thinking`, `thinking_budget` | `enable_thinking: true`<br>`thinking_budget`: exact value |
| **MiniMax** | M2 | `thinking` | `reasoning_split` | `reasoning_split: true` |
| **DeepSeek** | R1 | `thinking` | *(Stripped)* | Parameter removed to prevent API error (400) |

## Implementation Details

### 1. OpenAI Adapter (`OpenAIAdapter`)
- **File:** `src/adapters/openai-adapter.ts`
- **Behavior:** Maps continuous token budget into discrete effort levels.
- **New Feature:** Added support for `minimal` effort (typically < 4000 tokens) for faster, lighter reasoning tasks.

### 2. Gemini Adapter (`GeminiAdapter`)
- **File:** `src/adapters/gemini-adapter.ts`
- **Behavior:**
    - **Gemini 3 detection:** Checks `modelId` for "gemini-3". Uses `thinking_level`.
    - **Backward Compatibility:** Defaults to `thinking_config` for Gemini 2.0/2.5.
    - **Safety:** Caps budget at 24k tokens to maintain stability.

### 3. Grok Adapter (`GrokAdapter`)
- **File:** `src/adapters/grok-adapter.ts`
- **Behavior:**
    - **Validation:** Explicitly checks for "mini" models (Grok 3 Mini).
    - **Stripping:** Removes thinking parameters for standard Grok 3 models which do not support API-controlled reasoning (prevents errors).

### 4. Qwen Adapter (`QwenAdapter`)
- **File:** `src/adapters/qwen-adapter.ts`
- **Behavior:**
    - Enables the specific `enable_thinking` flag required by Alibaba Cloud / OpenRouter.
    - Passes the budget through directly.

### 5. MiniMax Adapter (`MiniMaxAdapter`)
- **File:** `src/adapters/minimax-adapter.ts`
- **Behavior:**
    - Sets `reasoning_split: true`.
    - Does not support budget control, but correctly enables the interleaved reasoning feature.

### 6. DeepSeek Adapter (`DeepSeekAdapter`)
- **File:** `src/adapters/deepseek-adapter.ts`
- **Behavior:**
    - **Defensive:** Detects DeepSeek models and *removes* the `thinking` object.
    - **Reasoning:** Reasoning happens automatically (R1) or not at all; sending the parameter causes API rejection.

## Protocol Integration

The translation happens during the `prepareRequest` phase of the `BaseModelAdapter`.
1.  **Intercept:** The adapter intercepts the `ClaudeRequest`.
2.  **Translate:** It reads `thinking.budget_tokens`.
3.  **Mutate:** It modifies the `OpenRouterPayload` to add provider-specific fields.
4.  **Clean:** It deletes the original `thinking` object to prevent OpenRouter from receiving conflicting or unrecognized parameters.
