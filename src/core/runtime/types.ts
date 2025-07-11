/**
 * Supported runtime environments
 */
export type RuntimeType =
  | 'nodejs'
  | 'deno'
  | 'bun'
  | 'cloudflare-workers'
  | 'fastly-compute'

/**
 * Runtime feature capabilities
 */
export interface RuntimeFeatures {
  /** Whether the runtime supports file system operations */
  supportsFileSystem: boolean
  /** Whether the runtime supports WebSocket connections */
  supportsWebSocket: boolean
  /** Whether the runtime supports Web Crypto API */
  supportsWebCrypto: boolean
  /** Whether the runtime supports streaming APIs */
  supportsStreams: boolean
  /** Whether the runtime supports long-running processes */
  supportsLongRunning: boolean
}

/**
 * Runtime information including type, version, and capabilities
 */
export interface RuntimeInfo {
  /** The detected runtime type */
  type: RuntimeType
  /** Runtime version (if available) */
  version: string | undefined
  /** Available features in this runtime */
  features: RuntimeFeatures
  /** Runtime constraints for this runtime */
  constraints: RuntimeConstraints
}

/**
 * Runtime constraints for execution limits
 */
export interface RuntimeConstraints {
  /** Maximum execution time in milliseconds (Infinity for unlimited) */
  maxExecutionTime: number
  /** Maximum memory usage in bytes (if applicable) */
  maxMemoryUsage?: number
  /** Maximum number of concurrent operations */
  maxConcurrentOperations?: number
  /** Request timeout in milliseconds */
  requestTimeout?: number
}
