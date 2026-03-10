const axios = require('axios').default
const Logger = require('../Logger')
const fs = require('../libs/fsExtra')
const path = require('path')

/**
 * qBittorrent Web API client
 */
class QBittorrentClient {
  /**
   * Build base URL from settings
   *
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @returns {string}
   */
  _getBaseUrl(settings) {
    return `http://${settings.qbtHost}:${settings.qbtPort}`
  }

  /**
   * Login to qBittorrent and return the session cookie
   *
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @returns {Promise<string|null>} - SID cookie value, or null on failure
   */
  async login(settings) {
    const baseUrl = this._getBaseUrl(settings)
    try {
      const response = await axios.post(
        `${baseUrl}/api/v2/auth/login`,
        new URLSearchParams({
          username: settings.qbtUsername,
          password: settings.qbtPassword
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
          maxRedirects: 0,
          validateStatus: (s) => s < 400
        }
      )

      const setCookie = response.headers['set-cookie']
      if (!setCookie) {
        Logger.warn('[QBittorrentClient] Login succeeded but no cookie returned')
        return null
      }

      const sidCookie = setCookie.find((c) => c.startsWith('SID='))
      if (!sidCookie) return null

      return sidCookie.split(';')[0] // "SID=xxxx"
    } catch (error) {
      Logger.error('[QBittorrentClient] Login failed', error.message)
      return null
    }
  }

  /**
   * Add a torrent to qBittorrent by writing the .torrent file to the savepath
   * directory and passing a file:// URL (multipart upload returns "Fails." in v5).
   *
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @param {Object} torrentOptions
   * @param {Buffer} torrentOptions.torrentBuffer - Raw .torrent file bytes
   * @param {string} torrentOptions.filename - Filename for the .torrent file
   * @param {string} torrentOptions.savepath - Save path (must be accessible to qBittorrent)
   * @param {string} [torrentOptions.category]
   * @param {number} [torrentOptions.ratioLimit]
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async addTorrent(settings, torrentOptions) {
    const sid = await this.login(settings)
    if (!sid) {
      return { success: false, error: 'Failed to authenticate with qBittorrent' }
    }

    const baseUrl = this._getBaseUrl(settings)

    // Write .torrent file into the save directory so qBittorrent can read it via file://
    const torrentFilePath = path.join(torrentOptions.savepath, torrentOptions.filename || 'download.torrent')
    try {
      await fs.writeFile(torrentFilePath, torrentOptions.torrentBuffer)
      Logger.debug(`[QBittorrentClient] Wrote torrent file to ${torrentFilePath}`)
    } catch (error) {
      Logger.error('[QBittorrentClient] Failed to write torrent file', error.message)
      return { success: false, error: `Failed to write torrent file: ${error.message}` }
    }

    try {
      const params = new URLSearchParams()
      params.set('urls', `file://${torrentFilePath}`)
      params.set('savepath', torrentOptions.savepath)
      params.set('contentLayout', 'NoSubfolder') // always flatten into savepath, never create torrent root dir
      if (torrentOptions.category) params.set('category', torrentOptions.category)
      if (torrentOptions.ratioLimit != null) params.set('ratioLimit', String(torrentOptions.ratioLimit))

      const response = await axios.post(`${baseUrl}/api/v2/torrents/add`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: sid
        },
        timeout: 15000
      })

      if (response.data === 'Ok.') {
        Logger.info(`[QBittorrentClient] Torrent added: ${torrentOptions.filename}`)
        return { success: true }
      }
      Logger.warn(`[QBittorrentClient] Unexpected response: ${response.data}`)
      return { success: false, error: response.data || 'Unknown error from qBittorrent' }
    } catch (error) {
      Logger.error('[QBittorrentClient] addTorrent failed', error.message)
      return { success: false, error: error.message }
    } finally {
      // Clean up the .torrent file after submission
      fs.unlink(torrentFilePath).catch(() => {})
    }
  }

  /**
   * Test connection to qBittorrent
   *
   * @param {import('../objects/settings/DiscoverySettings')} settings
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async testConnection(settings) {
    const sid = await this.login(settings)
    if (!sid) {
      return { success: false, error: 'Authentication failed - check host, port, username and password' }
    }

    const baseUrl = this._getBaseUrl(settings)
    try {
      const response = await axios.get(`${baseUrl}/api/v2/app/version`, {
        headers: { Cookie: sid },
        timeout: 10000
      })
      return { success: true, version: response.data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

module.exports = new QBittorrentClient()
