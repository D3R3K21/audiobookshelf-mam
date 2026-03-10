class DiscoverySettings {
  constructor(settings = null) {
    this.id = 'discovery-settings'

    // Global toggles
    this.discoveryEnabled = false
    this.discoverAuthors = true
    this.discoverSeries = true

    // MAM / Mousehole
    this.mouseholeUrl = process.env.MOUSEHOLE_URL || 'http://localhost:5010'
    this.mamUsername = ''
    this.mamPassword = ''

    // qBittorrent client — env vars are used as defaults when first initialized;
    // values saved to the database take precedence after first run.
    this.qbtHost = process.env.QBT_HOST || 'localhost'
    this.qbtPort = process.env.QBT_PORT ? Number(process.env.QBT_PORT) : 8080
    this.qbtUsername = process.env.QBT_USERNAME || 'admin'
    this.qbtPassword = process.env.QBT_PASSWORD || ''
    this.qbtCategory = process.env.QBT_CATEGORY || 'mam'
    this.qbtSeedRatio = process.env.QBT_SEED_RATIO ? Number(process.env.QBT_SEED_RATIO) : 1.0

    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings) {
    this.discoveryEnabled = !!settings.discoveryEnabled
    this.discoverAuthors = settings.discoverAuthors !== false
    this.discoverSeries = settings.discoverSeries !== false

    this.mouseholeUrl = settings.mouseholeUrl || process.env.MOUSEHOLE_URL || 'http://localhost:5010'
    this.mamUsername = settings.mamUsername || ''
    this.mamPassword = settings.mamPassword || ''

    this.qbtHost = settings.qbtHost || process.env.QBT_HOST || 'localhost'
    this.qbtPort = settings.qbtPort != null ? Number(settings.qbtPort) : (process.env.QBT_PORT ? Number(process.env.QBT_PORT) : 8080)
    this.qbtUsername = settings.qbtUsername || process.env.QBT_USERNAME || 'admin'
    this.qbtPassword = settings.qbtPassword || process.env.QBT_PASSWORD || ''
    this.qbtCategory = settings.qbtCategory || process.env.QBT_CATEGORY || 'mam'
    this.qbtSeedRatio = settings.qbtSeedRatio != null ? Number(settings.qbtSeedRatio) : (process.env.QBT_SEED_RATIO ? Number(process.env.QBT_SEED_RATIO) : 1.0)
  }

  toJSON() {
    return {
      id: this.id,
      discoveryEnabled: this.discoveryEnabled,
      discoverAuthors: this.discoverAuthors,
      discoverSeries: this.discoverSeries,
      mouseholeUrl: this.mouseholeUrl,
      mamUsername: this.mamUsername,
      mamPassword: this.mamPassword,
      qbtHost: this.qbtHost,
      qbtPort: this.qbtPort,
      qbtUsername: this.qbtUsername,
      qbtPassword: this.qbtPassword,
      qbtCategory: this.qbtCategory,
      qbtSeedRatio: this.qbtSeedRatio
    }
  }

  update(payload) {
    if (!payload) return false
    let hasUpdates = false

    const booleanFields = ['discoveryEnabled', 'discoverAuthors', 'discoverSeries']
    for (const field of booleanFields) {
      if (payload[field] !== undefined && !!payload[field] !== this[field]) {
        this[field] = !!payload[field]
        hasUpdates = true
      }
    }

    const stringFields = ['mouseholeUrl', 'mamUsername', 'mamPassword', 'qbtHost', 'qbtUsername', 'qbtPassword', 'qbtCategory']
    for (const field of stringFields) {
      if (payload[field] !== undefined && payload[field] !== this[field]) {
        this[field] = payload[field] || ''
        hasUpdates = true
      }
    }

    if (payload.qbtPort != null && Number(payload.qbtPort) !== this.qbtPort) {
      this.qbtPort = Number(payload.qbtPort)
      hasUpdates = true
    }

    if (payload.qbtSeedRatio != null && Number(payload.qbtSeedRatio) !== this.qbtSeedRatio) {
      this.qbtSeedRatio = Number(payload.qbtSeedRatio)
      hasUpdates = true
    }

    return hasUpdates
  }
}

module.exports = DiscoverySettings
