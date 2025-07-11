import { getRuntimeConstraints } from '@/core/runtime/constraints'
import { getRuntimeFeatures } from '@/core/runtime/features'
import type { RuntimeInfo, RuntimeType } from '@/core/runtime/types'

let detectedRuntime: RuntimeInfo | null = null

/**
 * Get runtime information for the current environment
 * @returns Runtime information including type, version, and features
 */
export function getRuntimeInfo(): RuntimeInfo {
  if (detectedRuntime) return detectedRuntime

  detectedRuntime = detectRuntime()
  return detectedRuntime
}

function detectRuntime(): RuntimeInfo {
  const global = globalThis as Record<string, unknown>
  const type = detectRuntimeType()
  let version: string | undefined = undefined

  switch (type) {
    case 'deno': {
      const deno = global.Deno as Record<string, unknown>
      const denoVersion = (deno.version as Record<string, unknown> | undefined)
        ?.deno as string | undefined
      version = denoVersion
      break
    }
    case 'bun': {
      const bun = global.Bun as Record<string, unknown>
      version = bun.version as string | undefined
      break
    }
    case 'nodejs': {
      version =
        'process' in global
          ? ((global.process as Record<string, unknown>).version as
              | string
              | undefined)
          : undefined
      break
    }
    // Other runtimes do not have a version property
    default:
      version = undefined
      break
  }

  return {
    type,
    version,
    features: getRuntimeFeatures(type),
    constraints: getRuntimeConstraints(type),
  }
}

function detectRuntimeType(): RuntimeType {
  const global = globalThis as Record<string, unknown>

  // Deno detection
  if ('Deno' in global && global.Deno) return 'deno'

  // Bun detection
  if ('Bun' in global && global.Bun) return 'bun'

  // Fastly Compute detection
  if ('fastly' in global) return 'fastly-compute'

  // Cloudflare Workers detection
  if (
    'CloudflareWorkerGlobalScope' in global ||
    ('WorkerGlobalScope' in global && 'caches' in global)
  )
    return 'cloudflare-workers'

  // Node.js detection (default fallback)
  return 'nodejs'
}
