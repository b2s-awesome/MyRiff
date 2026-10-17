import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// Capture Electron's normal data location before portable mode changes it.
export const standardUserDataPath = app.getPath('userData')
export const executableDirectory = path.dirname(app.getPath('exe'))
export const portableUserDataPath = path.join(executableDirectory, 'MyRiff-Data')
export const portableMarkerPath = path.join(executableDirectory, 'myriff-portable.flag')

export function activatePortableDataPath() {
  if (!fs.existsSync(portableMarkerPath)) return false
  try {
    fs.mkdirSync(portableUserDataPath, { recursive: true })
    const portableDb = path.join(portableUserDataPath, 'myriff.sqlite')
    const standardDb = path.join(standardUserDataPath, 'myriff.sqlite')
    if (!fs.existsSync(portableDb) && fs.existsSync(standardDb)) {
      fs.cpSync(standardUserDataPath, portableUserDataPath, { recursive: true, force: false, errorOnExist: false })
    }
    app.setPath('userData', portableUserDataPath)
    return true
  } catch (error) {
    console.warn('Could not activate portable data mode; using the standard user-data directory instead.', error)
    return false
  }
}
