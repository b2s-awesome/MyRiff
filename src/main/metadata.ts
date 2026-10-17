import type { MetadataSuggestion, Track } from '../shared/types'

const USER_AGENT = 'MyRiff/0.2.0 (private desktop music player; metadata lookup)'
const clean = (value: unknown) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim()

export async function searchMusicBrainz(track: Pick<Track, 'title' | 'artist' | 'album' | 'year'>): Promise<MetadataSuggestion[]> {
  const title = clean(track.title)
  const artist = clean(track.artist)
  if (!title) return []
  const query = [`recording:"${title.replace(/"/g, '\\"')}"`, artist ? `AND artist:"${artist.replace(/"/g, '\\"')}"` : ''].filter(Boolean).join(' ')
  const url = `https://musicbrainz.org/ws/2/recording/?${new URLSearchParams({ query, fmt: 'json', limit: '8', inc: 'artists+releases' })}`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`MusicBrainz returned HTTP ${response.status}.`)
  const json = await response.json() as any
  const suggestions: MetadataSuggestion[] = []
  for (const rec of Array.isArray(json.recordings) ? json.recordings : []) {
    const mbArtist = Array.isArray(rec['artist-credit']) ? rec['artist-credit'].map((a: any) => typeof a === 'string' ? a : a.name || a.artist?.name).filter(Boolean).join('') : ''
    const release = Array.isArray(rec.releases) ? rec.releases.find((r: any) => r.status === 'Official') || rec.releases[0] : null
    const releaseArtist = release?.['artist-credit']?.map((a: any) => typeof a === 'string' ? a : a.name || a.artist?.name).filter(Boolean).join('')
    const candidateTitle = clean(rec.title || title)
    const candidateArtist = clean(mbArtist || releaseArtist || artist)
    const candidateAlbum = clean(release?.title || track.album)
    const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
    const exactTitle = norm(candidateTitle) === norm(title) ? 0.62 : 0.25
    const exactArtist = artist && norm(candidateArtist) === norm(artist) ? 0.3 : artist ? 0.08 : 0.18
    const exactAlbum = track.album && norm(candidateAlbum) === norm(track.album) ? 0.08 : 0
    const year = Number(String(release?.date || '').slice(0, 4)) || null
    const yearBonus = track.year && year === track.year ? 0.05 : 0
    let artworkUrl: string | null = null
    if (release?.id) {
      try {
        const art = await fetch(`https://coverartarchive.org/release/${encodeURIComponent(release.id)}/front-250`, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(4500) })
        if (art.ok) artworkUrl = art.url
      } catch { /* cover art is optional */ }
    }
    suggestions.push({ provider: 'MusicBrainz', title: candidateTitle, artist: candidateArtist, album: candidateAlbum, year, musicBrainzRecordingId: rec.id, musicBrainzReleaseId: release?.id, artworkUrl, confidence: Math.min(0.99, exactTitle + exactArtist + exactAlbum + yearBonus) })
  }
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 8)
}
