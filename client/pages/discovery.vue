<template>
  <div id="page-wrapper" class="bg-bg page overflow-y-auto p-4 md:p-8">
    <div class="max-w-6xl mx-auto">

      <!-- Header -->
      <div class="flex items-center mb-4 gap-4">
        <h1 class="text-2xl font-semibold">Book Discovery</h1>
        <div class="grow" />
        <div class="flex items-center gap-3">
          <p v-if="cachedAt && !loading" class="text-xs text-white/30">Cached {{ cachedAtRelative }}</p>
          <ui-btn small :loading="loading" @click="load(true)">Refresh</ui-btn>
          <ui-dropdown v-model="groupBy" :items="groupByItems" small label="" class="w-40" />
          <ui-dropdown v-if="libraryDropdownItems.length" v-model="selectedLibraryId" :items="libraryDropdownItems" small label="" class="w-44" />
        </div>
      </div>

      <!-- Tracking row -->
      <div class="flex items-center gap-3 mb-6 p-3 bg-white/5 rounded-lg">
        <span class="text-xs text-white/40 shrink-0">Tracking:</span>
        <ui-multi-select-dropdown
          v-if="groupBy === 'author'"
          :value="enabledAuthorIds"
          :items="allAuthorDropdownItems"
          label=""
          class="grow"
          @input="onAuthorSelectionChange"
        />
        <ui-multi-select-dropdown
          v-else
          :value="enabledSeriesIds"
          :items="allSeriesDropdownItems"
          label=""
          class="grow"
          @input="onSeriesSelectionChange"
        />
      </div>

      <div v-if="loading" class="flex justify-center py-16">
        <ui-loading-indicator />
      </div>

      <div v-else-if="!discoveryEnabled" class="text-center py-16 text-white/40">
        <span class="material-symbols text-5xl">search_off</span>
        <p class="mt-3 text-lg">Discovery is not enabled</p>
        <nuxt-link to="/config/discovery" class="text-blue-400 hover:underline text-sm mt-2 inline-block">Configure Discovery Settings</nuxt-link>
      </div>

      <div v-else-if="groupBy === 'author' && !enabledAuthorIds.length" class="text-center py-16 text-white/40">
        <span class="material-symbols text-5xl">person_search</span>
        <p class="mt-3 text-lg">No authors tracked</p>
        <p class="text-sm mt-1">Select authors above to see their missing books.</p>
      </div>

      <div v-else-if="groupBy === 'series' && !enabledSeriesIds.length" class="text-center py-16 text-white/40">
        <span class="material-symbols text-5xl">auto_stories</span>
        <p class="mt-3 text-lg">No series tracked</p>
        <p class="text-sm mt-1">Select series above to see their missing books.</p>
      </div>

      <div v-else-if="!displayGroups.length" class="text-center py-16 text-white/40">
        <span class="material-symbols text-5xl">auto_awesome</span>
        <p class="mt-3 text-lg">No missing books found</p>
        <p class="text-sm mt-1">All tracked {{ groupBy === 'author' ? 'authors' : 'series' }} appear to be complete!</p>
      </div>

      <div v-else>
        <p class="text-white/40 text-sm mb-6">{{ totalDiscovered }} book{{ totalDiscovered !== 1 ? 's' : '' }} not yet in your library</p>

        <div v-for="group in displayGroups" :key="group.key" class="mb-4 border border-white/10 rounded-lg overflow-hidden">
          <button class="w-full flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-left" @click="toggleGroup(group.key)">
            <span class="material-symbols text-base text-white/40">{{ groupBy === 'author' ? 'person' : 'auto_stories' }}</span>
            <span class="text-base font-medium grow">{{ group.label }}</span>
            <span class="text-sm text-white/40 font-normal">{{ group.discoveredBooks.length }} missing</span>
            <span class="material-symbols text-base text-white/40 ml-1">{{ collapsedGroups[group.key] ? 'expand_more' : 'expand_less' }}</span>
          </button>
          <div v-if="!collapsedGroups[group.key]" class="flex flex-wrap gap-3 p-4">
            <cards-discovered-book-card
              v-for="book in group.discoveredBooks"
              :key="book.asin || book.title"
              :book="book"
              :card-width="120"
              :cover-height="180"
              @click="openMAMSearch"
            />
          </div>
        </div>
      </div>
    </div>

    <modals-m-a-m-search-modal v-model="showMAMModal" :book="selectedBook" />
  </div>
</template>

<script>
export default {
  data() {
    return {
      loading: true,
      discoveryEnabled: false,
      results: [],
      seriesResults: [],
      cachedAt: null,
      groupBy: 'author',
      groupByItems: [
        { text: 'Group by Author', value: 'author' },
        { text: 'Group by Series', value: 'series' }
      ],
      selectedLibraryId: null,
      libraries: [],
      allAuthors: [],
      allSeries: [],
      enabledAuthorIds: [],
      enabledSeriesIds: [],
      showMAMModal: false,
      selectedBook: null,
      collapsedGroups: {}
    }
  },
  computed: {
    displayGroups() {
      if (this.groupBy === 'series') {
        return this.seriesResults
          .filter((r) => this.enabledSeriesIds.includes(r.seriesId))
          .map((r) => ({
            key: r.seriesId,
            label: r.seriesName,
            discoveredBooks: r.discoveredBooks || []
          }))
      }
      return this.results
        .filter((r) => this.enabledAuthorIds.includes(r.authorId))
        .map((r) => ({
          key: r.authorId,
          label: r.authorName,
          discoveredBooks: r.discoveredBooks || []
        }))
    },
    totalDiscovered() {
      return this.displayGroups.reduce((acc, g) => acc + g.discoveredBooks.length, 0)
    },
    cachedAtRelative() {
      if (!this.cachedAt) return ''
      const diff = Date.now() - new Date(this.cachedAt).getTime()
      const hours = Math.floor(diff / 3600000)
      if (hours < 1) return 'less than an hour ago'
      return `${hours}h ago`
    },
    libraryDropdownItems() {
      return this.libraries.map((l) => ({ text: l.name, value: l.id }))
    },
    allAuthorDropdownItems() {
      return this.allAuthors.map((a) => ({ text: a.name, value: a.id }))
    },
    allSeriesDropdownItems() {
      return this.allSeries.map((s) => ({ text: s.name, value: s.id }))
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    }
  },
  watch: {
    selectedLibraryId(val, old) {
      if (old !== null) this.load()
    },
    groupBy() {
      this.loadGroupData()
    }
  },
  async mounted() {
    const [trackedData, libData] = await Promise.all([
      this.$axios.$get('/api/discovery/tracked-authors').catch(() => null),
      this.$axios.$get('/api/libraries').catch(() => null)
    ])
    this.enabledAuthorIds = trackedData?.trackedAuthorIds || []
    this.enabledSeriesIds = trackedData?.trackedSeriesIds || []
    this.libraries = (libData?.libraries || []).filter((l) => l.mediaType === 'book')
    this.selectedLibraryId = this.currentLibraryId || this.libraries[0]?.id || null

    await this.load()
  },
  methods: {
onAuthorSelectionChange(newIds) {
      const added = newIds.filter((id) => !this.enabledAuthorIds.includes(id))
      this.enabledAuthorIds = newIds
      this.saveTracked()
      added.forEach((id) => this.loadAuthorDiscovery(id))
    },
    onSeriesSelectionChange(newIds) {
      const added = newIds.filter((id) => !this.enabledSeriesIds.includes(id))
      this.enabledSeriesIds = newIds
      this.saveTracked()
      added.forEach((id) => this.loadSeriesDiscovery(id))
    },
    saveTracked() {
      this.$axios.$patch('/api/discovery/tracked-authors', {
        trackedAuthorIds: this.enabledAuthorIds,
        trackedSeriesIds: this.enabledSeriesIds
      }).catch((err) => {
        console.error('Failed to save tracked items', err)
      })
    },
    async loadAuthorDiscovery(authorId) {
      try {
        const data = await this.$axios.$get(`/api/discovery/authors/${authorId}`)
        if (data.enabled !== false) {
          const existing = this.results.findIndex((r) => r.authorId === authorId)
          if (existing >= 0) {
            this.$set(this.results, existing, data)
          } else {
            this.results.push(data)
          }
        }
      } catch (err) {
        console.error('Failed to load author discovery', err)
      }
    },
    async loadSeriesDiscovery(seriesId) {
      try {
        const data = await this.$axios.$get(`/api/discovery/series/${seriesId}`)
        if (data.enabled !== false) {
          const existing = this.seriesResults.findIndex((r) => r.seriesId === seriesId)
          if (existing >= 0) {
            this.$set(this.seriesResults, existing, data)
          } else {
            this.seriesResults.push(data)
          }
        }
      } catch (err) {
        console.error('Failed to load series discovery', err)
      }
    },
    async loadGroupData() {
      // Fetch any newly-tracked items that haven't been loaded yet for the current mode
      if (this.groupBy === 'series') {
        const missing = this.enabledSeriesIds.filter((id) => !this.seriesResults.find((r) => r.seriesId === id))
        await Promise.all(missing.map((id) => this.loadSeriesDiscovery(id)))
      } else {
        const missing = this.enabledAuthorIds.filter((id) => !this.results.find((r) => r.authorId === id))
        await Promise.all(missing.map((id) => this.loadAuthorDiscovery(id)))
      }
    },
    async load(refresh = false) {
      this.loading = true
      try {
        // Check discovery enabled via settings (avoids triggering a full scan)
        const settings = await this.$axios.$get('/api/settings/discovery').catch(() => null)
        this.discoveryEnabled = settings?.discoveryEnabled !== false
        if (!this.discoveryEnabled) return

        // If refreshing, clear cached results so they are re-fetched
        if (refresh) {
          this.results = []
          this.seriesResults = []
          this.cachedAt = null
        }

        // Load library entity lists
        if (this.selectedLibraryId) {
          const [authData, sData] = await Promise.all([
            this.$axios.$get(`/api/libraries/${this.selectedLibraryId}/authors`).catch(() => null),
            this.$axios.$get(`/api/libraries/${this.selectedLibraryId}/series`).catch(() => null)
          ])
          this.allAuthors = (authData?.authors || []).sort((a, b) => a.name.localeCompare(b.name))
          this.allSeries = ((sData?.results || []).map((s) => ({ id: s.id, name: s.name }))).sort((a, b) => a.name.localeCompare(b.name))
        }

        // Fetch discovery for tracked items (skip already-loaded unless refreshing)
        const authorsToLoad = refresh ? this.enabledAuthorIds : this.enabledAuthorIds.filter((id) => !this.results.find((r) => r.authorId === id))
        const seriesToLoad = refresh ? this.enabledSeriesIds : this.enabledSeriesIds.filter((id) => !this.seriesResults.find((r) => r.seriesId === id))
        await Promise.all([
          ...authorsToLoad.map((id) => this.loadAuthorDiscovery(id)),
          ...seriesToLoad.map((id) => this.loadSeriesDiscovery(id))
        ])
      } catch (err) {
        console.error('Failed to load discovery', err)
        this.discoveryEnabled = false
      } finally {
        this.loading = false
      }
    },
    toggleGroup(key) {
      this.$set(this.collapsedGroups, key, !this.collapsedGroups[key])
    },
    openMAMSearch(book) {
      this.selectedBook = book
      this.showMAMModal = true
    }
  }
}
</script>
