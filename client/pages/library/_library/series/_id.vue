<template>
  <div class="page" :class="[streamLibraryItem ? 'streaming' : '', discoveryVisible ? 'has-discovery' : 'no-discovery']">
    <app-book-shelf-toolbar :selected-series="series" />

    <!-- Series action bar — always visible, contains rescan button + discovery header -->
    <div class="series-action-bar px-4 py-2 border-b border-white/10 bg-bg flex flex-col">
      <!-- Always-visible action row -->
      <div class="flex items-center gap-3">
        <span v-if="discoveryVisible" class="material-symbols text-base text-blue-300">cloud_download</span>
        <span v-if="discoveryVisible" class="text-sm font-medium">{{ discoveredBooks.length }} Missing Book{{ discoveredBooks.length !== 1 ? 's' : '' }}</span>
        <span v-if="discoveryVisible" class="text-white/40 text-xs">Not yet in your library</span>
        <div class="grow" />
        <ui-tooltip :text="scanStatus === 'idle' ? 'Scan library for new media, then auto-match metadata' : scanStatusLabel" direction="bottom">
          <button class="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/10" :class="scanStatus !== 'idle' ? 'text-white/30 cursor-not-allowed' : 'text-white/50 hover:text-white'" :disabled="scanStatus !== 'idle'" @click="rescanLibrary">
            <span class="material-symbols text-base" :class="{ 'animate-spin': scanStatus !== 'idle' }">{{ scanStatus === 'matching' ? 'auto_fix_high' : 'refresh' }}</span>
            <span>{{ scanStatusLabel }}</span>
          </button>
        </ui-tooltip>
      </div>
      <!-- Missing books strip -->
      <div v-if="discoveryVisible" class="flex gap-3 overflow-x-auto pb-1 mt-2">
        <cards-discovered-book-card
          v-for="book in discoveredBooks"
          :key="book.asin || book.title"
          :book="book"
          :card-width="100"
          :cover-height="150"
          @click="openMAMSearch"
        />
      </div>
    </div>

    <app-lazy-bookshelf page="series-books" :series-id="seriesId" />

    <modals-m-a-m-search-modal v-model="showMAMModal" :book="selectedBook" />
  </div>
</template>

<script>
export default {
  async asyncData({ store, params, redirect, query, app }) {
    const libraryId = params.library
    const libraryData = await store.dispatch('libraries/fetch', libraryId)
    if (!libraryData) {
      return redirect('/oops?message=Library not found')
    }

    const library = libraryData.library
    if (library.mediaType === 'podcast') {
      return redirect(`/library/${libraryId}`)
    }

    const series = await app.$axios.$get(`/api/libraries/${library.id}/series/${params.id}?include=progress,rssfeed`).catch((error) => {
      console.error('Failed', error)
      return false
    })
    if (!series) {
      return redirect('/oops?message=Series not found')
    }

    return {
      series,
      seriesId: params.id
    }
  },
  data() {
    return {
      discoveredBooks: [],
      discoveryEnabled: false,
      showMAMModal: false,
      selectedBook: null,
      scanStatus: 'idle' // 'idle' | 'scanning' | 'matching'
    }
  },
  computed: {
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    discoveryVisible() {
      return this.discoveryEnabled && this.discoveredBooks.length > 0
    },
    currentLibraryId() {
      return this.$route.params.library
    },
    scanStatusLabel() {
      if (this.scanStatus === 'scanning') return 'Scanning…'
      if (this.scanStatus === 'matching') return 'Matching…'
      return 'Rescan'
    }
  },
  methods: {
    seriesUpdated(series) {
      this.series = series
    },
    async onTaskFinished(task) {
      if (task.action !== 'library-scan' || task.data?.libraryId !== this.currentLibraryId) return
      this.scanStatus = 'matching'
      try {
        const filterVal = Buffer.from(this.seriesId).toString('base64')
        const data = await this.$axios.$get(`/api/libraries/${this.currentLibraryId}/items`, {
          params: { filter: `series.${filterVal}`, minified: 1, limit: 100 }
        }).catch(() => null)

        const allItems = data?.results || []
        if (!allItems.length) {
          this.$toast.success('Scan complete — no items found in series')
          return
        }

        // Match all items in the series to ensure series sequence and metadata are up to date.
        // Priority: (1) item's own ASIN, (2) ASIN from discovery data matched by folder name,
        // (3) title search fallback. Items with no ASIN and no discovery match are skipped.
        let byOwnAsin = 0
        let byDiscoveredAsin = 0
        let byTitle = 0
        let skipped = 0
        await Promise.all(allItems.map(async (item) => {
          const itemAsin = item.media?.metadata?.asin
          const folderName = item.path?.split('/').pop()?.toLowerCase().trim() || ''
          const discovered = this.discoveredBooks.find((b) => {
            const t = (b.title || '').toLowerCase().trim()
            return t === folderName || folderName.includes(t) || t.includes(folderName)
          })

          const matchBody = { provider: 'audible', overrideDetails: true, overrideCover: true }
          if (itemAsin) {
            // Use the item's own ASIN — already correct, just refresh sequence/metadata
            matchBody.asin = itemAsin
            byOwnAsin++
          } else if (discovered?.asin) {
            // Newly downloaded item — use the ASIN from our discovery data
            matchBody.asin = discovered.asin
            byDiscoveredAsin++
          } else if (item.media?.metadata?.title || folderName) {
            // Fall back to title search
            matchBody.title = item.media?.metadata?.title || folderName
            byTitle++
          } else {
            skipped++
            return
          }

          await this.$axios.$post(`/api/items/${item.id}/match`, matchBody).catch((err) => {
            console.error(`[Series] match failed for ${item.id}`, err)
          })
        }))

        const parts = []
        if (byOwnAsin) parts.push(`${byOwnAsin} refreshed`)
        if (byDiscoveredAsin) parts.push(`${byDiscoveredAsin} new by ASIN`)
        if (byTitle) parts.push(`${byTitle} by title`)
        this.$toast.success(`Scan complete — ${parts.join(', ')}${skipped ? ` (${skipped} skipped)` : ''}`)
      } catch (err) {
        console.error('[Series] match after scan failed', err)
        this.$toast.error('Scan complete but match failed')
      } finally {
        this.scanStatus = 'idle'
      }
    },
    async loadDiscovery() {
      const data = await this.$axios.$get(`/api/discovery/series/${this.seriesId}`).catch(() => null)
      if (data) {
        this.discoveryEnabled = data.enabled !== false
        this.discoveredBooks = data.discoveredBooks || []
        if (this.discoveryVisible) {
          // Let the DOM update then tell the bookshelf to recalculate its height
          this.$nextTick(() => window.dispatchEvent(new Event('resize')))
        }
      }
    },
    openMAMSearch(book) {
      this.selectedBook = book
      this.showMAMModal = true
    },
    async rescanLibrary() {
      if (this.scanStatus !== 'idle') return
      this.scanStatus = 'scanning'
      try {
        await this.$axios.$post(`/api/libraries/${this.currentLibraryId}/scan`)
        this.$toast.success('Library scan started')
        // onTaskFinished will trigger matchall when scan completes
      } catch (err) {
        this.$toast.error('Failed to start library scan')
        console.error('[Series] rescanLibrary failed', err)
        this.scanStatus = 'idle'
      }
    }
  },
  mounted() {
    this.loadDiscovery()
    if (this.$root.socket) {
      this.$root.socket.on('series_updated', this.seriesUpdated)
      this.$root.socket.on('task_finished', this.onTaskFinished)
    }
  },
  beforeDestroy() {
    if (this.$root.socket) {
      this.$root.socket.off('series_updated', this.seriesUpdated)
      this.$root.socket.off('task_finished', this.onTaskFinished)
    }
  }
}
</script>

<style>
/* Series action bar is always shown — shrink bookshelf by bar height (~40px) */
#page-content #bookshelf,
.page #bookshelf {
  height: calc(100% - 40px - 40px) !important;
}
/* When discovery strip is also visible, shrink further (~195px for the cards row) */
.has-discovery #bookshelf {
  height: calc(100% - 40px - 40px - 170px) !important;
}
</style>
