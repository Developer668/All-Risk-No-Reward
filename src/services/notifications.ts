let unlockTimer: number | undefined

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

export async function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported' as const
  return Notification.requestPermission()
}

async function show(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, {
    body,
    tag,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: { url: '/app' },
  })
  return true
}

export function scheduleUnlockNotification(unlockAt: string, challengeTitle?: string) {
  if (unlockTimer) window.clearTimeout(unlockTimer)
  const delay = new Date(unlockAt).getTime() - Date.now()
  if (delay <= 0 || delay > 2_147_000_000) return
  unlockTimer = window.setTimeout(() => {
    void show(
      'Your courage challenge is ready',
      challengeTitle ? `Today’s card: ${challengeTitle}` : 'Open your private daily card when you are ready.',
      `daily-unlock-${unlockAt.slice(0, 10)}`,
    )
  }, delay)
}

export async function sendTestNotification() {
  return show('Notifications are on', 'We’ll nudge you when your daily challenge unlocks.', 'notifications-test')
}
