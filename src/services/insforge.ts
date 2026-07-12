import type { InsForgeClient } from '@insforge/sdk'

const baseUrl = import.meta.env.VITE_INSFORGE_URL as string | undefined
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string | undefined

export const isInsforgeConfigured = Boolean(baseUrl && anonKey)

export interface AppAuthUser {
  id: string
  email: string
  name: string
}

export interface PublicAuthConfig {
  requireEmailVerification: boolean
  verifyEmailMethod: 'code' | 'link'
  resetPasswordMethod: 'code' | 'link'
  passwordMinLength: number
  requireNumber: boolean
  requireLowercase: boolean
  requireUppercase: boolean
  requireSpecialChar: boolean
  disableSignup: boolean
  oAuthProviders: string[]
}

export interface SignUpResult {
  user: AppAuthUser | null
  requiresVerification: boolean
  verifyEmailMethod: 'code' | 'link'
}

interface PendingRemoteOnboarding {
  email: string
  name: string
  disabledBoundaryTags: string[]
  boundaries: string[]
}

const ONBOARDING_STORAGE_KEY = 'all-risk-no-reward.remote-onboarding.v1'

const localAuthConfig: PublicAuthConfig = {
  requireEmailVerification: false,
  verifyEmailMethod: 'code',
  resetPasswordMethod: 'code',
  passwordMinLength: 8,
  requireNumber: false,
  requireLowercase: true,
  requireUppercase: false,
  requireSpecialChar: false,
  disableSignup: false,
  oAuthProviders: [],
}

let clientPromise: Promise<InsForgeClient | null> | undefined

export async function getInsforge(): Promise<InsForgeClient | null> {
  if (!isInsforgeConfigured) return null
  if (!clientPromise) {
    clientPromise = import('@insforge/sdk').then(({ createClient }) => createClient({
      baseUrl: baseUrl!,
      anonKey: anonKey!,
      timeout: 70_000,
      retryCount: 1,
    }))
  }
  return clientPromise
}

function messageFrom(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  if (error instanceof Error) return error.message
  return fallback
}

function normalizeUser(user: unknown): AppAuthUser | null {
  if (!user || typeof user !== 'object') return null
  const record = user as Record<string, unknown>
  if (!record.id || !record.email) return null
  return {
    id: String(record.id),
    email: String(record.email),
    name: String(record.name || (record.profile as Record<string, unknown> | undefined)?.name || String(record.email).split('@')[0]),
  }
}

export async function getPublicAuthConfig(): Promise<PublicAuthConfig> {
  const client = await getInsforge()
  if (!client) return localAuthConfig
  const { data, error } = await client.auth.getPublicAuthConfig()
  if (error || !data) throw new Error(messageFrom(error, 'Could not load sign-in settings. Try again.'))
  return {
    requireEmailVerification: data.requireEmailVerification,
    verifyEmailMethod: data.verifyEmailMethod,
    resetPasswordMethod: data.resetPasswordMethod,
    passwordMinLength: data.passwordMinLength,
    requireNumber: data.requireNumber,
    requireLowercase: data.requireLowercase,
    requireUppercase: data.requireUppercase,
    requireSpecialChar: data.requireSpecialChar,
    disableSignup: data.disableSignup,
    oAuthProviders: data.oAuthProviders,
  }
}

export async function restoreRemoteSession(): Promise<AppAuthUser | null> {
  const client = await getInsforge()
  if (!client) return null
  const { data, error } = await client.auth.getCurrentUser()
  if (error) return null
  return normalizeUser(data.user)
}

export async function signInRemote(email: string, password: string): Promise<AppAuthUser> {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(messageFrom(error, 'We could not sign you in. Check your email and password.'))
  const user = normalizeUser(data?.user)
  if (!user) throw new Error('Sign-in succeeded, but the account response was incomplete.')
  return user
}

export async function signUpRemote(name: string, email: string, password: string, config: PublicAuthConfig): Promise<SignUpResult> {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { data, error } = await client.auth.signUp({
    name,
    email,
    password,
    redirectTo: `${window.location.origin}/sign-in`,
  })
  if (error || !data) throw new Error(messageFrom(error, 'We could not create your account. Try again.'))
  return {
    user: normalizeUser(data.user),
    requiresVerification: Boolean(data.requireEmailVerification),
    verifyEmailMethod: config.verifyEmailMethod,
  }
}

export async function verifyRemoteEmail(email: string, otp: string): Promise<AppAuthUser> {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { data, error } = await client.auth.verifyEmail({ email, otp })
  if (error) throw new Error(messageFrom(error, 'That verification code is invalid or expired.'))
  const user = normalizeUser(data?.user)
  if (!user) throw new Error('Verification succeeded, but the account response was incomplete.')
  return user
}

export async function resendRemoteVerification(email: string) {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { error } = await client.auth.resendVerificationEmail({ email, redirectTo: `${window.location.origin}/sign-in` })
  if (error) throw new Error(messageFrom(error, 'We could not resend the verification email.'))
}

export async function startRemotePasswordReset(email: string) {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { error } = await client.auth.sendResetPasswordEmail({
    email,
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw new Error(messageFrom(error, 'We could not send the password reset email.'))
}

export async function exchangeRemoteResetCode(email: string, code: string): Promise<string> {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { data, error } = await client.auth.exchangeResetPasswordToken({ email, code })
  if (error || !data?.token) throw new Error(messageFrom(error, 'That reset code is invalid or expired.'))
  return data.token
}

export async function finishRemotePasswordReset(newPassword: string, token: string) {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { error } = await client.auth.resetPassword({ newPassword, otp: token })
  if (error) throw new Error(messageFrom(error, 'We could not update your password.'))
}

export async function signInRemoteWithOAuth(provider: string) {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { error } = await client.auth.signInWithOAuth(provider, { redirectTo: `${window.location.origin}/app` })
  if (error) throw new Error(messageFrom(error, `We could not connect to ${provider}.`))
}

export async function signOutRemote() {
  const client = await getInsforge()
  if (!client) return
  const { error } = await client.auth.signOut()
  if (error) throw new Error(messageFrom(error, 'We could not sign you out.'))
}

export async function invokeRemote<T>(slug: string, body?: Record<string, unknown>): Promise<T> {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { data, error } = await client.functions.invoke(slug, body ? { body } : { method: 'GET' })
  if (error) throw new Error(messageFrom(error, `The ${slug} service is unavailable.`))
  return data as T
}

export async function callRemoteRpc<T>(name: string, data?: Record<string, unknown>): Promise<T> {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured.')
  const { data: result, error } = await client.database.rpc(name, data)
  if (error) throw new Error(messageFrom(error, `The ${name} operation failed.`))
  return result as T
}

export function queueRemoteOnboarding(input: PendingRemoteOnboarding) {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(input))
  } catch {
    // The signed-in callback also attempts the write immediately. Storage is a
    // convenience for link-based verification, never a source of authority.
  }
}

export async function applyPendingRemoteOnboarding(user: AppAuthUser) {
  let pending: PendingRemoteOnboarding | undefined
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (raw) pending = JSON.parse(raw) as PendingRemoteOnboarding
  } catch {
    pending = undefined
  }
  if (!pending || pending.email.toLowerCase() !== user.email.toLowerCase()) return

  await callRemoteRpc('update_profile_preferences', {
    p_display_name: pending.name,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_boundaries: pending.boundaries,
    p_disabled_boundary_tags: pending.disabledBoundaryTags,
    p_minimum_age_confirmed: true,
    p_accept_terms: true,
    p_acknowledge_privacy: true,
  })
  try { window.localStorage.removeItem(ONBOARDING_STORAGE_KEY) } catch { /* noop */ }
}
