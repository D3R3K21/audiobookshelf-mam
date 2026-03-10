const Path = require('path')
const { Request, Response } = require('express')
const axios = require('axios').default
const Logger = require('../Logger')
const Database = require('../Database')
const fs = require('../libs/fsExtra')
const { sanitizeFilename } = require('../utils/fileUtils')
const { levenshteinDistance } = require('../utils/index')

const MAMProvider = require('../providers/MAMProvider')
const QBittorrentClient = require('../clients/QBittorrentClient')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

const AUDIBLE_CATALOG_URL = 'https://api.audible.com/1.0/catalog/products'
const AUDIBLE_RESPONSE_GROUPS = 'media,product_attrs,contributors,series'

/**
 * Search the Audible catalog API.
 * @param {Object} params - query params (author, keywords, num_results, etc.)
 * @returns {Promise<Object[]>} raw Audible product objects
 */
async function searchAudibleCatalog(params) {
  const queryObj = {
    num_results: '50',
    products_sort_by: 'Relevance',
    response_groups: AUDIBLE_RESPONSE_GROUPS,
    ...params
  }
  const url = `${AUDIBLE_CATALOG_URL}?${new URLSearchParams(queryObj).toString()}`
  Logger.debug(`[DiscoveryController] Audible catalog search: ${url}`)
  try {
    const res = await axios.get(url, { timeout: 15000 })
    return res.data?.products || []
  } catch (error) {
    Logger.warn(`[DiscoveryController] Audible catalog search failed: ${error.message}`)
    return []
  }
}

/**
 * Map a raw Audible catalog product to our discovery book shape.
 * @param {Object} p
 */
function mapAudibleBook(p) {
  const series = p.series?.[0]
  return {
    asin: p.asin || null,
    title: p.title || '',
    subtitle: p.subtitle || null,
    cover: p.product_images?.['500'] || p.product_images?.['256'] || null,
    publishedYear: p.release_date ? p.release_date.substring(0, 4) : null,
    authors: (p.authors || []).map((a) => ({ name: a.name })),
    seriesName: series?.title || null,
    seriesPosition: series?.sequence || null
  }
}

function isAuthorDiscoveryEnabled(author) {
  const settings = Database.discoverySettings
  if (!settings.discoveryEnabled || !settings.discoverAuthors) return false
  if (author.discoveryOverride === true) return true
  if (author.discoveryOverride === false) return false
  return true
}

function isSeriesDiscoveryEnabled(series) {
  const settings = Database.discoverySettings
  if (!settings.discoveryEnabled || !settings.discoverSeries) return false
  if (series.discoveryOverride === true) return true
  if (series.discoveryOverride === false) return false
  return true
}

/**
 * Filter Audible catalog products against existing library items, returning only missing ones.
 * Only considers unabridged English editions — skips dramatized adaptations, split parts, and foreign editions.
 * libraryItems are Sequelize LibraryItem instances with media (Book) included.
 * @param {Object[]} audibleProducts
 * @param {import('../models/LibraryItem')[]} libraryItems
 */
function findMissingBooks(audibleProducts, libraryItems) {
  const libraryAsins = new Set()
  const libraryTitles = new Set()

  for (const li of libraryItems) {
    const book = li.media
    if (!book) continue
    if (book.asin) libraryAsins.add(book.asin.toUpperCase())
    if (book.title) libraryTitles.add(book.title.toLowerCase().trim())
    // Also include the folder/directory name as a fallback title so that items
    // with incorrect metadata (e.g. wrong match) are still recognised as present
    if (li.path) {
      const folderName = Path.basename(li.path).toLowerCase().trim()
      if (folderName) libraryTitles.add(folderName)
    }
  }

  return audibleProducts.filter((p) => {
    // Skip non-unabridged editions (dramatized adaptations, split parts, etc.)
    if (p.format_type && p.format_type !== 'unabridged') return false
    // Skip non-English editions
    if (p.language && p.language !== 'english') return false

    if (p.asin && libraryAsins.has(p.asin.toUpperCase())) return false
    if (p.title) {
      const bookTitle = p.title.toLowerCase().trim()
      for (const libTitle of libraryTitles) {
        if (levenshteinDistance(bookTitle, libTitle) <= 3) return false
      }
    }
    return true
  })
}

class DiscoveryController {
  constructor() {}

  /**
   * GET /api/discovery/authors/:authorId
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getAuthorDiscovery(req, res) {
    const author = await Database.authorModel.findByPk(req.params.authorId)
    if (!author) return res.sendStatus(404)

    if (!isAuthorDiscoveryEnabled(author)) {
      return res.json({ enabled: false, discoveredBooks: [] })
    }

    const products = await searchAudibleCatalog({ author: author.name })
    const libraryItems = await Database.libraryItemModel.getForAuthor(author, req.user)
    const missingBooks = findMissingBooks(products, libraryItems)

    const books = missingBooks.map(mapAudibleBook).sort((a, b) => {
      const pa = parseFloat(a.seriesPosition) || Infinity
      const pb = parseFloat(b.seriesPosition) || Infinity
      return pa - pb || (a.title || '').localeCompare(b.title || '')
    })

    res.json({
      enabled: true,
      authorId: author.id,
      authorName: author.name,
      discoveredBooks: books
    })
  }

  /**
   * GET /api/discovery/series/:seriesId
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getSeriesDiscovery(req, res) {
    const series = await Database.seriesModel.findByPk(req.params.seriesId)
    if (!series) return res.sendStatus(404)

    if (!isSeriesDiscoveryEnabled(series)) {
      return res.json({ enabled: false, discoveredBooks: [] })
    }

    const seriesNameLower = series.name.toLowerCase().trim()

    // Search Audible catalog for this series name
    const products = await searchAudibleCatalog({ keywords: series.name })

    // Keep only products that actually belong to this series
    const seriesProducts = products.filter((p) => p.series?.some((s) => s.title?.toLowerCase().trim() === seriesNameLower))

    // Load all library books (with media) to diff against
    const libraryItems = await Database.libraryItemModel.getLibraryItemsIncrement(0, 5000, { mediaType: 'book' })
    const missingBooks = findMissingBooks(seriesProducts, libraryItems)

    const books = missingBooks.map(mapAudibleBook).sort((a, b) => {
      const pa = parseFloat(a.seriesPosition) || Infinity
      const pb = parseFloat(b.seriesPosition) || Infinity
      return pa - pb
    })

    res.json({
      enabled: true,
      seriesId: series.id,
      seriesName: series.name,
      discoveredBooks: books
    })
  }

  /**
   * GET /api/discovery
   * Aggregated discovery across all authors
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getAllDiscovery(req, res) {
    const settings = Database.discoverySettings
    if (!settings.discoveryEnabled) {
      return res.json({ enabled: false, results: [] })
    }

    const cache = Database.discoveryCache
    const forceRefresh = req.query.refresh === 'true'

    // Serve from cache if fresh and not forcing a refresh
    if (!forceRefresh && !cache.isStale()) {
      return res.json({ enabled: true, results: cache.results, cachedAt: cache.updatedAt })
    }

    const libraryId = req.query.libraryId
    const whereClause = {}
    if (libraryId) whereClause.libraryId = libraryId

    const authors = await Database.authorModel.findAll({ where: whereClause })
    const results = []

    for (const author of authors) {
      if (!isAuthorDiscoveryEnabled(author)) continue

      const products = await searchAudibleCatalog({ author: author.name })
      const libraryItems = await Database.libraryItemModel.getForAuthor(author, req.user)
      const missingBooks = findMissingBooks(products, libraryItems)

      if (missingBooks.length > 0) {
        results.push({
          authorId: author.id,
          authorName: author.name,
          discoveredBooks: missingBooks.map(mapAudibleBook)
        })
      }
    }

    // Persist cache
    cache.set(results)
    await Database.updateSetting(cache)

    res.json({ enabled: true, results, cachedAt: cache.updatedAt })
  }

  /**
   * POST /api/discovery/mam-search
   * Body: { title, author }
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async mamSearch(req, res) {
    const { title, author } = req.body || {}
    if (!title) return res.status(400).send('title is required')

    const settings = Database.discoverySettings
    if (!settings.discoveryEnabled) {
      return res.status(400).send('Discovery is not enabled')
    }

    const results = await MAMProvider.search(title, author || '', settings)
    res.json({ results })
  }

  /**
   * POST /api/discovery/download
   * Body: { bookData, torrentUrl, libraryId, libraryFolderId }
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async initiateDownload(req, res) {
    if (!req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }

    const { bookData, torrentUrl, libraryId, libraryFolderId } = req.body || {}
    if (!torrentUrl) return res.status(400).send('torrentUrl is required')
    if (!libraryId) return res.status(400).send('libraryId is required')
    if (!libraryFolderId) return res.status(400).send('libraryFolderId is required')
    if (!bookData?.title) return res.status(400).send('bookData.title is required')

    const library = await Database.libraryModel.findByIdWithFolders(libraryId)
    if (!library) return res.status(404).send('Library not found')

    const folder = library.libraryFolders?.find((f) => f.id === libraryFolderId)
    if (!folder) return res.status(404).send('Library folder not found')

    // Build save path: {folder}/{Author}/{Series?}/{Title}/
    // contentLayout=NoSubfolder tells qBittorrent to flatten files directly into savepath,
    // so the torrent root directory (if any) is stripped and files land here cleanly.
    const parts = []
    const primaryAuthor = bookData.authors?.[0]?.name || bookData.author || ''
    if (primaryAuthor) parts.push(sanitizeFilename(primaryAuthor))
    if (bookData.seriesName) parts.push(sanitizeFilename(bookData.seriesName))
    parts.push(sanitizeFilename(bookData.title))

    const savePath = Path.join(folder.path, ...parts)

    try {
      await fs.ensureDir(savePath)
      Logger.info(`[DiscoveryController] Ensured directory: ${savePath}`)
    } catch (error) {
      Logger.error(`[DiscoveryController] Failed to create directory: ${savePath}`, error.message)
      return res.status(500).send('Failed to create download directory')
    }

    const settings = Database.discoverySettings

    // Download the .torrent file server-side using the MAM cookie,
    // then pass the bytes directly to qBittorrent (MAM download URLs require auth)
    Logger.info(`[DiscoveryController] Downloading torrent from MAM: ${torrentUrl}`)
    const torrentBuffer = await MAMProvider.downloadTorrentFile(torrentUrl, settings)
    if (!torrentBuffer) {
      return res.status(500).send('Failed to download .torrent file from MAM — check server logs')
    }
    Logger.info(`[DiscoveryController] Torrent buffer: ${torrentBuffer.length} bytes. Sending to qBittorrent, savepath=${savePath}`)

    const qbtResult = await QBittorrentClient.addTorrent(settings, {
      torrentBuffer,
      filename: `${sanitizeFilename(bookData.title)}.torrent`,
      savepath: savePath,
      category: settings.qbtCategory,
      ratioLimit: settings.qbtSeedRatio
    })

    if (!qbtResult.success) {
      Logger.error(`[DiscoveryController] qBittorrent addTorrent failed: ${qbtResult.error}`)
      return res.status(500).send(qbtResult.error || 'Failed to add torrent to qBittorrent')
    }

    res.json({ success: true, savePath })
  }

  /**
   * GET /api/settings/discovery
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getDiscoverySettings(req, res) {
    res.json(Database.discoverySettings.toJSON())
  }

  /**
   * PATCH /api/settings/discovery
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async updateDiscoverySettings(req, res) {
    if (!req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }

    const hasUpdates = Database.discoverySettings.update(req.body)
    if (hasUpdates) {
      await Database.updateSetting(Database.discoverySettings)
    }
    res.json(Database.discoverySettings.toJSON())
  }

  /**
   * POST /api/settings/discovery/test-mam
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async testMAMConnection(req, res) {
    if (!req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }

    const result = await MAMProvider.testConnection(Database.discoverySettings)
    res.json(result)
  }

  /**
   * GET /api/discovery/tracked-authors
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getTrackedAuthors(req, res) {
    const trackedAuthorIds = req.user.extraData?.discoveryTrackedAuthors || []
    const trackedSeriesIds = req.user.extraData?.discoveryTrackedSeries || []
    res.json({ trackedAuthorIds, trackedSeriesIds })
  }

  /**
   * PATCH /api/discovery/tracked-authors
   * Body: { trackedAuthorIds?: string[], trackedSeriesIds?: string[] }
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async updateTrackedAuthors(req, res) {
    const { trackedAuthorIds, trackedSeriesIds } = req.body || {}
    const extraData = { ...(req.user.extraData || {}) }
    if (Array.isArray(trackedAuthorIds)) extraData.discoveryTrackedAuthors = trackedAuthorIds
    if (Array.isArray(trackedSeriesIds)) extraData.discoveryTrackedSeries = trackedSeriesIds
    if (!Array.isArray(trackedAuthorIds) && !Array.isArray(trackedSeriesIds)) {
      return res.status(400).send('trackedAuthorIds or trackedSeriesIds must be provided')
    }
    req.user.extraData = extraData
    await req.user.save()
    res.json({ trackedAuthorIds: extraData.discoveryTrackedAuthors || [], trackedSeriesIds: extraData.discoveryTrackedSeries || [] })
  }

  /**
   * POST /api/settings/discovery/test-qbt
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async testQBTConnection(req, res) {
    if (!req.user.isAdminOrUp) {
      return res.sendStatus(403)
    }

    const result = await QBittorrentClient.testConnection(Database.discoverySettings)
    res.json(result)
  }
}

module.exports = new DiscoveryController()
