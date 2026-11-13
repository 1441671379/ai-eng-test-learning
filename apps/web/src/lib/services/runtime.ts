import { legacyEnvironment, LEGACY_DESKTOP_USER_AGENT } from "../compatibility/legacy";
import { headers } from 'next/headers'
import { localModelPort } from './local-config'

export type AppRuntime = 'desktop' | 'web'

export const ENGLISH_DESKTOP_UA_TOKEN = 'EnglishLearningDesktop'
export const DEFAULT_WEB_AI_ENGINE_URL = 'http://127.0.0.1:8000'
export const DEFAULT_WEB_COACH_ENGINE_URL = 'http://127.0.0.1:8001'
export const DEFAULT_DESKTOP_AI_ENGINE_URL = `http://127.0.0.1:${legacyEnvironment("ENGLISH_DESKTOP_AI_ENGINE_PORT") ?? '8010'}`
export const DEFAULT_DESKTOP_COACH_ENGINE_URL = `http://127.0.0.1:${legacyEnvironment("ENGLISH_DESKTOP_COACH_ENGINE_PORT") ?? '8011'}`

export async function getRequestRuntime(): Promise<AppRuntime> {
  const userAgent = (await headers()).get('user-agent') ?? ''
  return getRuntimeFromUserAgent(userAgent)
}

export function getRuntimeFromUserAgent(
  userAgent: string | null | undefined,
): AppRuntime {
  return [ENGLISH_DESKTOP_UA_TOKEN, LEGACY_DESKTOP_USER_AGENT].some(token => (userAgent ?? '').includes(token))
    ? 'desktop'
    : 'web'
}

export function getRequestRuntimeFromRequest(request: Request): AppRuntime {
  return getRuntimeFromUserAgent(request.headers.get('user-agent'))
}

export function getSpeechServiceUrl(runtime: AppRuntime): string {
  if (runtime === 'desktop') {
    return normalizeBaseUrl(
      legacyEnvironment("ENGLISH_DESKTOP_AI_ENGINE_URL"),
      DEFAULT_DESKTOP_AI_ENGINE_URL,
    )
  }

  return normalizeBaseUrl(legacyEnvironment("ENGLISH_SPEECH_URL") ?? process.env.AI_ENGINE_URL, DEFAULT_WEB_AI_ENGINE_URL)
}

export function getModelServiceUrl(runtime: AppRuntime): string {
  if (runtime === 'desktop') {
    return normalizeBaseUrl(
      legacyEnvironment("ENGLISH_DESKTOP_COACH_ENGINE_URL"),
      DEFAULT_DESKTOP_COACH_ENGINE_URL,
    )
  }

  const configuredPort = localModelPort()
  return normalizeBaseUrl(
    legacyEnvironment("ENGLISH_MODEL_URL") ?? (configuredPort ? `http://127.0.0.1:${configuredPort}` : process.env.AI_COACH_ENGINE_URL),
    DEFAULT_WEB_COACH_ENGINE_URL,
  )
}

export function getSpeechServiceUrlForRequest(request: Request): string {
  return getSpeechServiceUrl(getRequestRuntimeFromRequest(request))
}

export function getModelServiceUrlForRequest(request: Request): string {
  return getModelServiceUrl(getRequestRuntimeFromRequest(request))
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return value?.replace(/\/$/, '') ?? fallback
}

