import type { RuntimeConstraints, RuntimeType } from '@/core/runtime/types'

/**
 * Get runtime constraints for the specified runtime type
 * @param runtimeType - The runtime type to get constraints for
 * @returns The constraints for the specified runtime
 */
export function getRuntimeConstraints(
  runtimeType: RuntimeType,
): RuntimeConstraints {
  switch (runtimeType) {
    case 'cloudflare-workers':
      return {
        maxExecutionTime: 10000, // 10 seconds
        maxMemoryUsage: 128 * 1024 * 1024, // 128MB
        maxConcurrentOperations: 6,
        requestTimeout: 10000,
      }

    case 'fastly-compute':
      return {
        maxExecutionTime: 60000, // 60 seconds
        maxMemoryUsage: 256 * 1024 * 1024, // 256MB
        maxConcurrentOperations: 10,
        requestTimeout: 60000,
      }

    case 'nodejs':
    case 'deno':
    case 'bun':
    default:
      return {
        maxExecutionTime: Number.POSITIVE_INFINITY,
        // No memory/concurrency limits in standard Node.js environments
        requestTimeout: 30000, // 30 seconds default
      }
  }
}
