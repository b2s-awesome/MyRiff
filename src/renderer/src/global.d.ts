import type { MyRiffApi } from '../../preload/index'

declare global {
  interface Window {
    myriff: MyRiffApi
  }
}

export {}
