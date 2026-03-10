const axios = require('axios').default
const Logger = require('../Logger')

/**
 * MyAnonamouse torrent search provider
 */
class MAMProvider {
  constructor() {
    this.baseUrl = 'https://www.myanonamouse.net'
    this._lastRequestTime = 0
    this._minDelay = 2000 // 2 seconds between requests
  }

  /**
   * Enforce rate limit delay
   */
  async _rateLimit() {
    const now = Date.now()
    const elapsed = now - this._lastRequestTime
    if (elapsed < this._minDelay) {
      await new Promise((resolve) => setTimeout(resolve, this._minDelay - elapsed))
    }
    this._lastRequestTime = Date.now()
  }

  /**
   * Fetch the current mbsc cookie from mousehole, falling back to settings
   *
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @returns {Promise<string>} cookie header value e.g. "mbsc=xxx"
   */
  async _getCookieHeader(settings) {
    const mouseholeUrl = settings.mouseholeUrl || 'http://localhost:5010'
    try {
      const response = await axios.get(`${mouseholeUrl}/state`, { timeout: 3000 })
      const cookie = response.data?.currentCookie
      if (cookie) {
        Logger.debug('[MAMProvider] Using cookie from mousehole')
        return `mbsc=${cookie}`
      }
    } catch {
      Logger.debug('[MAMProvider] mousehole unavailable')
    }
    return ''
  }

  /**
   * Search MAM for audiobook torrents
   *
   * @param {string} title - Book title
   * @param {string} author - Author name
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @returns {Promise<Object[]>}
   */
  async search(title, author, settings) {
    const cookieHeader = await this._getCookieHeader(settings)
    if (!cookieHeader) {
      Logger.warn('[MAMProvider] No MAM session cookie configured')
      return []
    }

    await this._rateLimit()

    const searchText = [title, author].filter(Boolean).join(' ')

    const params = new URLSearchParams()
    params.set('tor[text]', searchText)
    params.set('tor[searchType]', 'all')
    params.set('tor[searchIn]', 'torrents')
    params.set('tor[main_cat][]', '13') // Audiobooks main category
    params.set('json', 'noredirect')
    params.set('Qs', searchText)

    const url = `${this.baseUrl}/tor/js/loadSearchJSONbasic.php?${params.toString()}`

    Logger.info(`[MAMProvider] Searching MAM: "${searchText}"`)

    try {
      const response = await axios.get(url, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': 'Mozilla/5.0 (compatible; audiobookshelf-discovery)',
          Accept: 'application/json',
          Referer: 'https://www.myanonamouse.net/'
        },
        timeout: 15000
      })

      const data = response.data
      if (!data || typeof data !== 'object') {
        Logger.warn('[MAMProvider] Unexpected MAM response format')
        return []
      }

      // MAM returns { total: N, data: [...] }
      const torrents = data.data || []
      if (!Array.isArray(torrents)) {
        Logger.warn('[MAMProvider] MAM returned no torrent array')
        return []
      }

      return torrents
        .map((t) => ({
          id: t.id,
          name: t.name || t.title || '',
          size: t.size || '',
          seeders: t.seeders || 0,
          leechers: t.leechers || 0,
          added: t.added || '',
          torrentUrl: `${this.baseUrl}/tor/download.php?tid=${t.id}`,
          detailUrl: `${this.baseUrl}/t/${t.id}`
        }))
        .sort((a, b) => b.seeders - a.seeders)
    } catch (error) {
      Logger.error('[MAMProvider] Search request failed', error.message)
      return []
    }
  }

  /**
   * Download a .torrent file from MAM using the session cookie
   *
   * @param {string} torrentUrl
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @returns {Promise<Buffer|null>}
   */
  async downloadTorrentFile(torrentUrl, settings) {
    const cookieHeader = await this._getCookieHeader(settings)
    if (!cookieHeader) {
      Logger.warn('[MAMProvider] No session cookie for torrent download')
      return null
    }
    try {
      const response = await axios.get(torrentUrl, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': 'Mozilla/5.0 (compatible; audiobookshelf-discovery)',
          Referer: 'https://www.myanonamouse.net/'
        },
        responseType: 'arraybuffer',
        timeout: 15000
      })
      const buf = Buffer.from(response.data)
      const contentType = response.headers['content-type'] || ''
      Logger.debug(`[MAMProvider] Torrent download: ${buf.length} bytes, content-type: ${contentType}, starts: ${buf.slice(0, 4).toString('latin1')}`)
      // A valid .torrent is a bencoded dict starting with 'd'
      if (buf.length < 10 || buf[0] !== 0x64 /* 'd' */) {
        Logger.error(`[MAMProvider] Downloaded content does not appear to be a valid torrent (first bytes: ${buf.slice(0, 200).toString('utf8', 0, 200)})`)
        return null
      }
      return buf
    } catch (error) {
      Logger.error('[MAMProvider] Failed to download torrent file', error.message)
      return null
    }
  }

  /**
   * Test MAM connection by attempting a basic authenticated request
   *
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @returns {Promise<{success: boolean, error?: string, source?: string}>}
   */
  async testConnection(settings) {
    const cookieHeader = await this._getCookieHeader(settings)
    if (!cookieHeader) {
      return { success: false, error: 'No session cookie configured' }
    }

    const source = 'mousehole'

    try {
      const response = await axios.get(`${this.baseUrl}/tor/js/loadSearchJSONbasic.php?tor[text]=test&json=noredirect&Qs=test`, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': 'Mozilla/5.0 (compatible; audiobookshelf-discovery)',
          Referer: 'https://www.myanonamouse.net/'
        },
        timeout: 10000
      })

      if (response.status === 200) {
        return { success: true, source }
      }
      return { success: false, error: `Unexpected status: ${response.status}` }
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        return { success: false, error: 'Authentication failed - check your session cookie' }
      }
      return { success: false, error: error.message }
    }
  }
}

module.exports = new MAMProvider()
