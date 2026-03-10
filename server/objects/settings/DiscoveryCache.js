const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

class DiscoveryCache {
  constructor(settings = null) {
    this.id = 'discovery-cache'
    this.updatedAt = null // ISO string
    this.results = [] // cached getAllDiscovery results array

    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings) {
    this.updatedAt = settings.updatedAt || null
    this.results = Array.isArray(settings.results) ? settings.results : []
  }

  isStale() {
    if (!this.updatedAt) return true
    return Date.now() - new Date(this.updatedAt).getTime() > CACHE_TTL_MS
  }

  set(results) {
    this.results = results
    this.updatedAt = new Date().toISOString()
  }

  toJSON() {
    return {
      id: this.id,
      updatedAt: this.updatedAt,
      results: this.results
    }
  }
}

module.exports = DiscoveryCache
