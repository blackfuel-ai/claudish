/**
 * Provider Registry for Local LLM Providers
 *
 * Supports Ollama and other OpenAI-compatible local providers.
 * Extensible via configuration - no code changes needed to add new providers.
 */

export interface ProviderCapabilities {
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
}

export interface LocalProvider {
  name: string;
  baseUrl: string;
  apiPath: string;
  envVar: string;
  apiKeyEnvVar: string; // Environment variable for API key (e.g., OLLAMA_API_KEY)
  prefixes: string[];
  capabilities: ProviderCapabilities;
}

export interface ResolvedProvider {
  provider: LocalProvider;
  modelName: string;
}

export interface UrlParsedModel {
  baseUrl: string;
  modelName: string;
}

// Built-in provider configurations
const getProviders = (): LocalProvider[] => [
  {
    name: "ollama",
    baseUrl: process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    apiPath: "/v1/chat/completions",
    envVar: "OLLAMA_BASE_URL",
    apiKeyEnvVar: "OLLAMA_API_KEY",
    prefixes: ["ollama/", "ollama:"],
    capabilities: {
      supportsTools: true,
      supportsVision: false,
      supportsStreaming: true,
      supportsJsonMode: true,
    },
  },
  {
    name: "lmstudio",
    baseUrl: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234",
    apiPath: "/v1/chat/completions",
    envVar: "LMSTUDIO_BASE_URL",
    apiKeyEnvVar: "LMSTUDIO_API_KEY",
    prefixes: ["lmstudio/", "lmstudio:", "mlstudio/", "mlstudio:"],  // mlstudio alias for common typo
    capabilities: {
      supportsTools: true,
      supportsVision: false,
      supportsStreaming: true,
      supportsJsonMode: true,
    },
  },
  {
    name: "vllm",
    baseUrl: process.env.VLLM_BASE_URL || "http://localhost:8000",
    apiPath: "/v1/chat/completions",
    envVar: "VLLM_BASE_URL",
    apiKeyEnvVar: "VLLM_API_KEY",
    prefixes: ["vllm/", "vllm:"],
    capabilities: {
      supportsTools: true,
      supportsVision: false,
      supportsStreaming: true,
      supportsJsonMode: true,
    },
  },
  {
    name: "mlx",
    baseUrl: process.env.MLX_BASE_URL || "http://127.0.0.1:8080",
    apiPath: "/v1/chat/completions",
    envVar: "MLX_BASE_URL",
    apiKeyEnvVar: "MLX_API_KEY",
    prefixes: ["mlx/", "mlx:"],
    capabilities: {
      // MLX server's tool parsing is fragile with Qwen models
      // Disable native tools - claudish will extract tool calls from text instead
      supportsTools: false,
      supportsVision: false,
      supportsStreaming: true,
      supportsJsonMode: true,
    },
  },
];

/**
 * Get all registered providers (refreshes env vars on each call)
 */
export function getRegisteredProviders(): LocalProvider[] {
  return getProviders();
}

/**
 * Resolve a model ID to a local provider if it matches any prefix
 */
export function resolveProvider(modelId: string): ResolvedProvider | null {
  const providers = getProviders();

  for (const provider of providers) {
    for (const prefix of provider.prefixes) {
      if (modelId.startsWith(prefix)) {
        return {
          provider,
          modelName: modelId.slice(prefix.length),
        };
      }
    }
  }

  return null;
}

/**
 * Check if CLAUDISH_BASE_URL is set (for custom OpenAI-compatible endpoints)
 */
export function hasCustomBaseUrl(): boolean {
  return !!process.env.CLAUDISH_BASE_URL;
}

/**
 * Get the custom base URL if set
 */
export function getCustomBaseUrl(): string | undefined {
  return process.env.CLAUDISH_BASE_URL;
}

/**
 * Check if a model ID matches any local provider pattern
 */
export function isLocalProvider(modelId: string): boolean {
  // Check prefix patterns
  if (resolveProvider(modelId) !== null) {
    return true;
  }

  // Check URL patterns
  if (parseUrlModel(modelId) !== null) {
    return true;
  }

  // Check if CLAUDISH_BASE_URL is set - any model can be used with custom base URL
  if (hasCustomBaseUrl()) {
    return true;
  }

  return false;
}

/**
 * Parse a URL-style model specification
 * Supports: http://localhost:11434/modelname or http://host:port/v1/modelname
 */
export function parseUrlModel(modelId: string): UrlParsedModel | null {
  // Check for http:// or https:// prefix
  if (!modelId.startsWith("http://") && !modelId.startsWith("https://")) {
    return null;
  }

  try {
    const url = new URL(modelId);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length === 0) {
      return null;
    }

    // Model name is the last path segment
    const modelName = pathParts[pathParts.length - 1];

    // Base URL is everything except the model name
    // Handle cases like /v1/modelname or just /modelname
    let basePath = "";
    if (pathParts.length > 1) {
      // Check if second-to-last is "v1" or similar API version
      const prefix = pathParts.slice(0, -1).join("/");
      if (prefix) basePath = "/" + prefix;
    }

    const baseUrl = `${url.protocol}//${url.host}${basePath}`;

    return {
      baseUrl,
      modelName,
    };
  } catch {
    return null;
  }
}

/**
 * Create an ad-hoc provider config for URL-based models
 */
export function createUrlProvider(parsed: UrlParsedModel): LocalProvider {
  return {
    name: "custom-url",
    baseUrl: parsed.baseUrl,
    apiPath: "/v1/chat/completions",
    envVar: "",
    apiKeyEnvVar: "", // Custom URLs use CLAUDISH_LOCAL_API_KEY fallback
    prefixes: [],
    capabilities: {
      supportsTools: true,
      supportsVision: false,
      supportsStreaming: true,
      supportsJsonMode: true,
    },
  };
}

/**
 * Create a provider config using CLAUDISH_BASE_URL
 * Used when model ID doesn't match any known provider but CLAUDISH_BASE_URL is set
 */
export function createCustomBaseUrlProvider(modelName: string): ResolvedProvider | null {
  const baseUrl = process.env.CLAUDISH_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  // Normalize base URL - remove trailing slash and /chat/completions if present
  let normalizedUrl = baseUrl.replace(/\/+$/, "");
  if (normalizedUrl.endsWith("/chat/completions")) {
    normalizedUrl = normalizedUrl.replace(/\/chat\/completions$/, "");
  }

  return {
    provider: {
      name: "custom-base-url",
      baseUrl: normalizedUrl,
      apiPath: "/chat/completions",
      envVar: "CLAUDISH_BASE_URL",
      apiKeyEnvVar: "", // Uses CLAUDISH_LOCAL_API_KEY fallback
      prefixes: [],
      capabilities: {
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
        supportsJsonMode: true,
      },
    },
    modelName,
  };
}
