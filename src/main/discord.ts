let client: any = null
let activeClientId = ''
export async function updateDiscord(enabled: boolean, clientId: string, track?: { title: string; artist: string; album?: string; duration?: number; position?: number; artworkUrl?: string | null }) {
  if (!enabled || !clientId.trim()) { try { client?.clearActivity(); client?.destroy() } catch {} client = null; activeClientId = ''; return }
  try {
    if (!client || activeClientId !== clientId) {
      try { client?.destroy() } catch {}
      const moduleName: string = 'discord-rpc'
      const mod: any = await import(moduleName)
      const RPC = mod.default ?? mod
      RPC.register(clientId)
      client = new RPC.Client({ transport: 'ipc' })
      activeClientId = clientId
      await client.login({ clientId })
    }
    if (!track) return
    const activity: any = { details: track.title.slice(0, 128), state: track.artist.slice(0, 128), type: 2, instance: false }
    if (track.album) activity.largeImageText = track.album.slice(0, 128)
    if (track.duration && track.position !== undefined) {
      activity.startTimestamp = Date.now() - track.position * 1000
      activity.endTimestamp = Date.now() + Math.max(0, track.duration - track.position) * 1000
    }
    activity.largeImageKey = 'myriff'
    await client.setActivity(activity)
  } catch (e) { console.warn('Discord Rich Presence unavailable:', e) }
}
export async function stopDiscord() { try { await client?.clearActivity(); await client?.destroy() } catch {}; client = null; activeClientId = '' }
