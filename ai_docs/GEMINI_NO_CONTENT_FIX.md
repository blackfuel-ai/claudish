# Gemini/Grok Empty Content Fix

## Problem
Users reported receiving "(no content)" messages before the actual response when using Gemini 2.0 Flash or other reasoning models.

**Root Cause**: The proxy server was proactively creating an empty text block (`content_block_start` with type `text`) immediately after receiving the request, "for protocol compliance". When the first chunk from the model arrived containing reasoning (thinking) or other content, this empty text block was closed without any text being added to it. Claude Code renders this closed empty block as a "(no content)" message.

## Solution
Removed the eager initialization of the empty text block. The code now lazily initializes the appropriate block type (text or thinking) based on the content of the first chunk received from the model.

### Changes in `src/proxy-server.ts`

**Removed (Commented Out):**
```typescript
// THINKING BLOCK SUPPORT: We still need to send content_block_start IMMEDIATELY
// Protocol requires it right after message_start, before ping
// But we'll close and reopen if reasoning arrives first
textBlockIndex = currentBlockIndex++;
sendSSE("content_block_start", {
  type: "content_block_start",
  index: textBlockIndex,
  content_block: {
    type: "text",
    text: "",
  },
});
textBlockStarted = true;
```

### Logic Flow

1. **Start**: Send `message_start` and `ping`.
2. **Wait**: Wait for first chunk from OpenRouter.
3. **First Chunk**:
   - **If Reasoning**: Start `thinking` block (index 0).
   - **If Content**: Start `text` block (index 0).
   - **If Tool Call**: Start `tool_use` block (index 0).

This ensures that no empty blocks are created and closed, preventing the "(no content)" rendering issue.

## Verification
- Analyzed code flow for all 3 scenarios (reasoning, content, tool use).
- Verified that `textBlockIndex` and `currentBlockIndex` are correctly managed without the eager initialization.
- Verified that existing lazy initialization logic handles the "not started" state correctly.

**Date**: 2025-11-25
**Status**: Fixed
