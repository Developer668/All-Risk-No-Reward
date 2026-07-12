import { ChallengeEngine, createUserState } from '../domain/engine'
import type { ReportChallengeInput } from '../domain/engine'
import type {
  ChallengeReport,
  DailyView,
  HistoryEntry,
  LocalAuthResult,
  LocalSession,
  NotificationRecord,
  Profile,
  SubmitCompletionInput,
  SubmitCompletionResult,
  UserDomainState,
  UserSettings,
} from '../types'

export const LOCAL_STORAGE_KEY = 'all-risk-no-reward.local.v1'
const DATABASE_VERSION = 1
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const PASSWORD_HASH_ITERATIONS = 210_000
const DEMO_EMAIL = 'demo@allrisk.local'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  dump() {
    return [...this.values.values()].join('\n')
  }
}

interface StoredAccount {
  id: string
  name: string
  email: string
  passwordHash: string
  passwordSalt: string
  passwordIterations: number
  createdAt: string
  updatedAt: string
}

interface LocalDatabase {
  version: 1
  accounts: Record<string, StoredAccount>
  users: Record<string, UserDomainState>
  session?: LocalSession
}

export interface LocalUserExport {
  exportedAt: string
  profile: Profile
  settings: UserSettings
  state: UserDomainState
  account: {
    email: string
    name: string
    createdAt: string
  }
}

export type LocalStoreErrorCode =
  | 'AUTH_REQUIRED'
  | 'ACCOUNT_EXISTS'
  | 'ACCOUNT_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'STORAGE_UNAVAILABLE'
  | 'CRYPTO_UNAVAILABLE'

export class LocalStoreError extends Error {
  constructor(public readonly code: LocalStoreErrorCode, message: string) {
    super(message)
    this.name = 'LocalStoreError'
  }
}

export interface LocalStoreOptions {
  storage?: StorageLike
  crypto?: Crypto
  now?: () => Date
  storageKey?: string
}

function browserStorage(): StorageLike {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return new MemoryStorage()
}

function emptyDatabase(): LocalDatabase {
  return { version: DATABASE_VERSION, accounts: {}, users: {} }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new LocalStoreError('INVALID_EMAIL', 'Enter a valid email address.')
  }
  return normalized
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new LocalStoreError('WEAK_PASSWORD', 'Use at least 8 characters for your password.')
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = base64ToBytes(left)
  const rightBytes = base64ToBytes(right)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

export class LocalStore {
  private readonly storage: StorageLike
  private readonly cryptoProvider?: Crypto
  private readonly now: () => Date
  private readonly storageKey: string

  constructor(options: LocalStoreOptions = {}) {
    this.storage = options.storage ?? browserStorage()
    this.cryptoProvider = options.crypto ?? globalThis.crypto
    this.now = options.now ?? (() => new Date())
    this.storageKey = options.storageKey ?? LOCAL_STORAGE_KEY
  }

  async signUp(name: string, email: string, password: string): Promise<LocalAuthResult> {
    const normalizedEmail = normalizeEmail(email)
    validatePassword(password)
    const normalizedName = name.trim()
    if (normalizedName.length < 1) throw new Error('Enter your name.')

    const database = this.load()
    if (this.accountByEmail(database, normalizedEmail)) {
      throw new LocalStoreError('ACCOUNT_EXISTS', 'An account with that email already exists on this device.')
    }
    const now = this.now()
    const account = await this.createAccount(normalizedName, normalizedEmail, password, now)
    database.accounts[account.id] = account
    database.users[account.id] = createUserState({
      id: account.id,
      name: account.name,
      email: account.email,
      now,
    })
    database.session = this.createSession(account.id, now)
    this.save(database)
    return this.authResult(database, account)
  }

  async signIn(email: string, password: string): Promise<LocalAuthResult> {
    const normalizedEmail = normalizeEmail(email)
    const database = this.load()
    const account = this.accountByEmail(database, normalizedEmail)
    if (!account) {
      throw new LocalStoreError('INVALID_CREDENTIALS', 'Email or password is incorrect.')
    }
    const candidateHash = await this.hashPassword(
      password,
      base64ToBytes(account.passwordSalt),
      account.passwordIterations,
    )
    if (!constantTimeEqual(candidateHash, account.passwordHash)) {
      throw new LocalStoreError('INVALID_CREDENTIALS', 'Email or password is incorrect.')
    }

    const now = this.now()
    database.session = this.createSession(account.id, now)
    this.save(database)
    return this.authResult(database, account)
  }

  /**
   * Device-local recovery: this deliberately does not claim to verify email ownership.
   * It is suitable for this offline-first mode; a hosted backend must use an emailed token.
   */
  async resetPassword(email: string, newPassword: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email)
    validatePassword(newPassword)
    const database = this.load()
    const account = this.accountByEmail(database, normalizedEmail)
    if (!account) {
      throw new LocalStoreError('ACCOUNT_NOT_FOUND', 'No local account uses that email address.')
    }
    const salt = this.randomBytes(16)
    account.passwordSalt = bytesToBase64(salt)
    account.passwordHash = await this.hashPassword(newPassword, salt, PASSWORD_HASH_ITERATIONS)
    account.passwordIterations = PASSWORD_HASH_ITERATIONS
    account.updatedAt = this.now().toISOString()
    if (database.session?.userId === account.id) delete database.session
    this.save(database)
  }

  async ensureDemoSession(): Promise<LocalAuthResult> {
    const database = this.load()
    let account = this.accountByEmail(database, DEMO_EMAIL)
    const now = this.now()
    if (!account) {
      const oneTimeSecret = bytesToBase64(this.randomBytes(32))
      account = await this.createAccount('Alex', DEMO_EMAIL, oneTimeSecret, now)
      database.accounts[account.id] = account
      database.users[account.id] = createUserState({
        id: account.id,
        name: account.name,
        email: account.email,
        now,
      })
    }
    database.session = this.createSession(account.id, now)
    this.save(database)
    return this.authResult(database, account)
  }

  restoreSession(): LocalAuthResult | null {
    const database = this.load()
    const session = database.session
    if (!session) return null
    if (new Date(session.expiresAt).getTime() <= this.now().getTime()) {
      delete database.session
      this.save(database)
      return null
    }
    const account = database.accounts[session.userId]
    if (!account || !database.users[session.userId]) {
      delete database.session
      this.save(database)
      return null
    }
    return this.authResult(database, account)
  }

  signOut(): void {
    const database = this.load()
    delete database.session
    this.save(database)
  }

  getProfile(): Profile {
    const { state } = this.authenticatedState()
    return { ...state.profile, boundaries: [...state.profile.boundaries] }
  }

  getSettings(): UserSettings {
    const { state } = this.authenticatedState()
    return JSON.parse(JSON.stringify(state.settings)) as UserSettings
  }

  getDashboard(now = this.now()): DailyView {
    return this.useEngine((engine) => engine.sync(now))
  }

  submitCompletion(input: SubmitCompletionInput, now = this.now()): SubmitCompletionResult {
    return this.useEngine((engine) => engine.submitCompletion(input, now))
  }

  completeRecovery(recoveryId: string, note = '', now = this.now()): DailyView {
    return this.useEngine((engine) => engine.completeRecovery(recoveryId, note, now))
  }

  rerollRecovery(recoveryId: string, now = this.now()): DailyView {
    return this.useEngine((engine) => engine.rerollRecovery(recoveryId, now))
  }

  getHistory(now = this.now()): HistoryEntry[] {
    return this.useEngine((engine) => engine.getHistory(now))
  }

  getNotifications(now = this.now()): NotificationRecord[] {
    return this.useEngine((engine) => {
      engine.sync(now)
      return [...engine.getState().notifications].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )
    })
  }

  markNotificationRead(notificationId: string, now = this.now()): void {
    this.useEngine((engine) => engine.markNotificationRead(notificationId, now))
  }

  markAllNotificationsRead(now = this.now()): void {
    this.useEngine((engine) => engine.markAllNotificationsRead(now))
  }

  updateSettings(patch: Partial<UserSettings>, now = this.now()): DailyView {
    return this.useEngine((engine) => engine.updateSettings(patch, now))
  }

  reportChallenge(input: ReportChallengeInput, now = this.now()): DailyView {
    return this.useEngine((engine) => engine.reportChallenge(input, now))
  }

  getReports(): ChallengeReport[] {
    const { state } = this.authenticatedState()
    return [...state.reports].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  exportData(): LocalUserExport {
    const { account, state } = this.authenticatedState()
    const safeState = JSON.parse(JSON.stringify(state)) as UserDomainState
    return {
      exportedAt: this.now().toISOString(),
      profile: { ...safeState.profile },
      settings: { ...safeState.settings },
      state: safeState,
      account: {
        email: account.email,
        name: account.name,
        createdAt: account.createdAt,
      },
    }
  }

  deleteMyData(): void {
    const { database, account } = this.authenticatedState()
    delete database.accounts[account.id]
    delete database.users[account.id]
    delete database.session
    this.save(database)
  }

  private useEngine<T>(operation: (engine: ChallengeEngine) => T): T {
    const { database, account, state } = this.authenticatedState()
    const engine = new ChallengeEngine(state)
    const result = operation(engine)
    database.users[account.id] = engine.getState()
    this.save(database)
    return result
  }

  private authenticatedState() {
    const database = this.load()
    const session = database.session
    if (!session || new Date(session.expiresAt).getTime() <= this.now().getTime()) {
      if (session) {
        delete database.session
        this.save(database)
      }
      throw new LocalStoreError('AUTH_REQUIRED', 'Sign in to continue.')
    }
    const account = database.accounts[session.userId]
    const state = database.users[session.userId]
    if (!account || !state) throw new LocalStoreError('AUTH_REQUIRED', 'Sign in to continue.')
    return { database, account, state }
  }

  private authResult(database: LocalDatabase, account: StoredAccount): LocalAuthResult {
    return {
      session: { ...database.session! },
      profile: {
        ...database.users[account.id].profile,
        boundaries: [...database.users[account.id].profile.boundaries],
      },
    }
  }

  private accountByEmail(database: LocalDatabase, email: string): StoredAccount | undefined {
    return Object.values(database.accounts).find((account) => account.email === email)
  }

  private async createAccount(name: string, email: string, password: string, now: Date): Promise<StoredAccount> {
    const salt = this.randomBytes(16)
    const timestamp = now.toISOString()
    return {
      id: this.randomId(),
      name,
      email,
      passwordHash: await this.hashPassword(password, salt, PASSWORD_HASH_ITERATIONS),
      passwordSalt: bytesToBase64(salt),
      passwordIterations: PASSWORD_HASH_ITERATIONS,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }

  private createSession(userId: string, now: Date): LocalSession {
    return {
      token: bytesToBase64(this.randomBytes(32)),
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
    }
  }

  private randomBytes(length: number): Uint8Array {
    if (!this.cryptoProvider) {
      throw new LocalStoreError('CRYPTO_UNAVAILABLE', 'Secure browser cryptography is unavailable.')
    }
    return this.cryptoProvider.getRandomValues(new Uint8Array(length))
  }

  private randomId(): string {
    if (!this.cryptoProvider) {
      throw new LocalStoreError('CRYPTO_UNAVAILABLE', 'Secure browser cryptography is unavailable.')
    }
    return this.cryptoProvider.randomUUID()
  }

  private async hashPassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {
    if (!this.cryptoProvider?.subtle) {
      throw new LocalStoreError('CRYPTO_UNAVAILABLE', 'Secure browser cryptography is unavailable.')
    }
    const key = await this.cryptoProvider.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await this.cryptoProvider.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      256,
    )
    return bytesToBase64(new Uint8Array(bits))
  }

  private load(): LocalDatabase {
    try {
      const serialized = this.storage.getItem(this.storageKey)
      if (!serialized) return emptyDatabase()
      const parsed = JSON.parse(serialized) as Partial<LocalDatabase>
      if (parsed.version !== DATABASE_VERSION || !parsed.accounts || !parsed.users) return emptyDatabase()
      return parsed as LocalDatabase
    } catch {
      throw new LocalStoreError('STORAGE_UNAVAILABLE', 'Local app data could not be read on this device.')
    }
  }

  private save(database: LocalDatabase) {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(database))
    } catch {
      throw new LocalStoreError('STORAGE_UNAVAILABLE', 'Local app data could not be saved on this device.')
    }
  }
}

export const localStore = new LocalStore()
