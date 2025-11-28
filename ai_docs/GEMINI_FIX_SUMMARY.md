# Gemini 3 Pro Thought Signature Fix

## Problem
Gemini 3 Pro was failing with error: "Function call is missing a thought_signature in functionCall parts"

**Root Cause**: OpenRouter requires the ENTIRE `reasoning_details` array to be preserved across requests when using Gemini 3 Pro, not just individual thought_signatures.

## Solution: Middleware System + Full reasoning_details Preservation

### 1. Created Middleware System Architecture

**Files Created:**
- `src/middleware/types.ts` - Middleware interfaces and context types
- `src/middleware/manager.ts` - Middleware orchestration and lifecycle management
- `src/middleware/gemini-thought-signature.ts` - Gemini-specific reasoning_details handler
- `src/middleware/index.ts` - Clean exports

**Lifecycle Hooks:**
1. `onInit()` - Server startup initialization
2. `beforeRequest()` - Pre-process requests (inject reasoning_details)
3. `afterResponse()` - Post-process non-streaming responses
4. `afterStreamChunk()` - Process streaming deltas (accumulate reasoning_details)
5. `afterStreamComplete()` - Finalize streaming (save accumulated reasoning_details)

### 2. Gemini Middleware Implementation

**Key Features:**
- **In-Memory Cache**: Stores `reasoning_details` arrays with associated tool_call_ids
- **Streaming Accumulation**: Collects reasoning_details across multiple chunks
- **Intelligent Injection**: Matches tool_call_ids to inject correct reasoning_details
- **Model-Specific**: Only activates for Gemini models

**Storage Structure:**
```typescript
Map<string, {
  reasoning_details: any[];      // Full array from response
  tool_call_ids: Set<string>;    // Associated tool calls
}>
```

### 3. Integration with Proxy Server

**Modified: `src/proxy-server.ts`**
- Initialize MiddlewareManager at startup
- Added `beforeRequest` hook before sending to OpenRouter
- Added `afterResponse` hook for non-streaming
- Added `afterStreamChunk` + `afterStreamComplete` for streaming
- Removed old thought signature code (file-based approach)

## Test Results

### ✅ Test 1: Simple Tool Call
- **Task**: List TypeScript files in src directory
- **Result**: PASSED - No errors
- **Log**: `claudish_2025-11-24_13-36-21.log`
- **Evidence**:
  - Saved 3 reasoning blocks with 1 tool call
  - Injected reasoning_details in follow-up request
  - Clean completion

### ✅ Test 2: Sequential Tool Calls
- **Task**: List middleware files, then read gemini-thought-signature.ts
- **Result**: PASSED - Exit code 0
- **Log**: `claudish_2025-11-24_13-37-24.log`
- **Evidence**:
  - Turn 1: Saved 3 blocks, 2 tool calls → Cache size 1
  - Turn 2: Injected from cache, saved 2 blocks, 1 tool call → Cache size 2
  - Turn 3: Injected with cacheSize=2, messageCount=7
  - No errors about missing thought_signatures

### ✅ Test 3: Complex Multi-Step Workflow
- **Task**: Analyze middleware architecture, read manager.ts, suggest improvements
- **Result**: PASSED - Exit code 0
- **Log**: `claudish_2025-11-24_13-38-26.log`
- **Evidence**:
  - Multiple rounds of streaming complete → save → inject
  - Deep analysis requiring complex reasoning
  - Coherent final response with architectural recommendations
  - Zero errors

### ✅ Final Validation
- **Error Check**: Searched all logs for errors, failures, exceptions
- **Result**: ZERO errors found
- **Thought Signature Errors**: NONE (fixed!)

## Technical Implementation Details

### Before Request Hook
```typescript
beforeRequest(context: RequestContext): void {
  // Iterate through messages
  for (const msg of context.messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      // Find matching reasoning_details by tool_call_ids
      for (const [msgId, cached] of this.persistentReasoningDetails.entries()) {
        const hasMatchingToolCall = msg.tool_calls.some(tc =>
          cached.tool_call_ids.has(tc.id)
        );
        if (hasMatchingToolCall) {
          // Inject full reasoning_details array
          msg.reasoning_details = cached.reasoning_details;
          break;
        }
      }
    }
  }
}
```

### Stream Chunk Accumulation
```typescript
afterStreamChunk(context: StreamChunkContext): void {
  // Accumulate reasoning_details from each chunk
  if (delta.reasoning_details && delta.reasoning_details.length > 0) {
    const accumulated = context.metadata.get("reasoning_details") || [];
    accumulated.push(...delta.reasoning_details);
    context.metadata.set("reasoning_details", accumulated);
  }

  // Track tool_call_ids
  if (delta.tool_calls) {
    const toolCallIds = context.metadata.get("tool_call_ids") || new Set();
    for (const tc of delta.tool_calls) {
      if (tc.id) toolCallIds.add(tc.id);
    }
    context.metadata.set("tool_call_ids", toolCallIds);
  }
}
```

### Stream Complete Storage
```typescript
afterStreamComplete(metadata: Map<string, any>): void {
  const reasoningDetails = metadata.get("reasoning_details") || [];
  const toolCallIds = metadata.get("tool_call_ids") || new Set();

  if (reasoningDetails.length > 0 && toolCallIds.size > 0) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.persistentReasoningDetails.set(messageId, {
      reasoning_details: reasoningDetails,
      tool_call_ids: toolCallIds,
    });
  }
}
```

## Key Insights

1. **OpenRouter Requirement**: The ENTIRE `reasoning_details` array must be preserved, not just individual thought_signatures
2. **Streaming Complexity**: reasoning_details arrive across multiple chunks and must be accumulated
3. **Matching Strategy**: Use tool_call_ids to match reasoning_details with the correct assistant message
4. **In-Memory Persistence**: Long-running proxy server allows in-memory caching (no file I/O needed)
5. **Middleware Pattern**: Clean separation of concerns, model-specific logic isolated from core proxy

## References

- OpenRouter Docs: https://openrouter.ai/docs/use-cases/reasoning-tokens#preserving-reasoning-blocks
- Gemini API Docs: https://ai.google.dev/gemini-api/docs/thought-signatures

## Status

✅ **COMPLETE AND VALIDATED**

All tests passing, zero errors, Gemini 3 Pro working correctly with tool calling and reasoning preservation.

---

**Date**: 2025-11-24
**Issue**: Gemini 3 Pro thought signature errors
**Solution**: Middleware system + full reasoning_details preservation
**Result**: 100% success rate across all test scenarios
