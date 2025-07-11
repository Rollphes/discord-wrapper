import type { RuntimeFeatures, RuntimeType } from '@/core/runtime/types'

/**
 * Get runtime features for the specified runtime type
 * @param runtimeType - The runtime type to get features for
 * @returns The features for the specified runtime
 */
export function getRuntimeFeatures(runtimeType: RuntimeType): RuntimeFeatures {
  switch (runtimeType) {
    case 'cloudflare-workers':
      return {
        supportsFileSystem: false,
        supportsWebSocket: true,
        supportsWebCrypto: true,
        supportsStreams: true,
        supportsLongRunning: false,
      }

    case 'fastly-compute':
      return {
        supportsFileSystem: false,
        supportsWebSocket: true,
        supportsWebCrypto: true,
        supportsStreams: true,
        supportsLongRunning: false,
      }

    case 'nodejs':
    case 'deno':
    case 'bun':
    default:
      return {
        supportsFileSystem: true,
        supportsWebSocket: true,
        supportsWebCrypto: true,
        supportsStreams: true,
        supportsLongRunning: true,
      }
  }
}
