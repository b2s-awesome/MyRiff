import { globalShortcut, BrowserWindow } from 'electron'
import type { AppSettings } from '../shared/types'

const actionByKey = {
  playPause: 'toggle',
  next: 'next',
  previous: 'previous',
  volumeUp: 'volume-up',
  volumeDown: 'volume-down'
} as const

type GlobalShortcutKey = keyof typeof actionByKey
let actionHandler: (action: string) => void = action => {
  const window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed())
  window?.webContents.send('player:action', action)
}

export function setGlobalShortcutActionHandler(handler: (action: string) => void) {
  actionHandler = handler
}

export function configureGlobalShortcuts(settings: Pick<AppSettings, 'globalShortcutsEnabled' | 'globalKeyboardShortcuts'>) {
  globalShortcut.unregisterAll()
  const registered: string[] = []
  const failed: string[] = []
  if (!settings.globalShortcutsEnabled) return { registered, failed }

  for (const key of Object.keys(actionByKey) as GlobalShortcutKey[]) {
    const accelerator = String(settings.globalKeyboardShortcuts?.[key] || '').trim()
    if (!accelerator) continue
    try {
      if (globalShortcut.register(accelerator, () => actionHandler(actionByKey[key]))) registered.push(key)
      else failed.push(`${key} (${accelerator})`)
    } catch (error) {
      failed.push(`${key} (${accelerator}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (failed.length) console.warn('[MyRiff] Some OS-global shortcuts could not be registered:', failed)
  return { registered, failed }
}
