<template>
  <modals-modal v-model="show" name="mam-search-modal" :width="700" :height="'unset'">
    <template #default>
      <div class="px-4 py-6 w-full text-sm rounded-lg bg-bg shadow-lg border border-white/5 overflow-y-auto" style="max-height: 85vh">
        <div class="flex items-center mb-4">
          <h1 class="text-lg font-semibold">Find on MyAnonamouse</h1>
          <div class="grow" />
          <button class="text-gray-400 hover:text-white" @click="show = false">
            <span class="material-symbols">close</span>
          </button>
        </div>

        <!-- Download destination — always at top -->
        <div class="flex gap-2 mb-4">
          <ui-dropdown v-model="selectedLibraryId" :items="libraryDropdownItems" label="Library" class="grow" small @input="onLibraryChange" />
          <ui-dropdown v-model="selectedFolderId" :items="folderDropdownItems" label="Folder" class="grow" small />
        </div>

        <p class="text-white/60 text-xs mb-4 truncate">{{ book.title }}<span v-if="authorName"> — {{ authorName }}</span></p>

        <!-- Search controls -->
        <div class="flex gap-2 mb-4">
          <ui-text-input v-model="searchTitle" placeholder="Title" class="grow" @keydown.enter="search" />
          <ui-text-input v-model="searchAuthor" placeholder="Author" class="grow" @keydown.enter="search" />
          <ui-btn :loading="searching" small @click="search">Search</ui-btn>
        </div>

        <!-- Confirm bar — appears when a torrent is selected -->
        <div v-if="selectedTorrent" class="flex items-center gap-3 mb-3 p-2 bg-success/10 border border-success/30 rounded">
          <span class="material-symbols text-success text-base">download</span>
          <span class="text-success text-xs truncate grow">{{ selectedTorrent.name }}</span>
          <ui-btn small color="bg-success" :loading="!!downloadingId" :disabled="!selectedLibraryId || !selectedFolderId" @click="confirmDownload">Send to qBittorrent</ui-btn>
          <button class="text-white/40 hover:text-white" @click="selectedTorrent = null">
            <span class="material-symbols text-base">close</span>
          </button>
        </div>

        <!-- Error -->
        <p v-if="searchError" class="text-red-400 text-xs mb-4">{{ searchError }}</p>

        <!-- Loading -->
        <div v-if="searching" class="flex justify-center py-8">
          <ui-loading-indicator />
        </div>

        <!-- No results -->
        <div v-else-if="searched && !results.length" class="text-center py-8 text-white/40">
          <span class="material-symbols text-4xl">search_off</span>
          <p class="mt-2">No results found on MAM</p>
        </div>

        <!-- Results table -->
        <div v-else-if="results.length">
          <table class="w-full text-xs table-fixed">
            <thead>
              <tr class="text-white/40 border-b border-white/10">
                <th class="text-left pb-2 font-normal">Name</th>
                <th class="text-right pb-2 font-normal w-24">Size</th>
                <th class="text-right pb-2 font-normal w-14">Seeds</th>
                <th class="text-right pb-2 font-normal w-14">Leech</th>
                <th class="text-right pb-2 font-normal w-24">Added</th>
                <th class="text-right pb-2 font-normal w-16" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="torrent in results"
                :key="torrent.id"
                class="border-b border-white/5 transition-opacity duration-150"
                :class="rowClass(torrent)"
              >
                <td class="py-2 pr-2 overflow-hidden">
                  <a :href="torrent.detailUrl" target="_blank" class="text-blue-300 hover:underline block truncate">{{ torrent.name }}</a>
                </td>
                <td class="py-2 text-right text-white/60 whitespace-nowrap">{{ torrent.size }}</td>
                <td class="py-2 text-right text-green-400">{{ torrent.seeders }}</td>
                <td class="py-2 text-right text-red-400">{{ torrent.leechers }}</td>
                <td class="py-2 text-right text-white/40 whitespace-nowrap">{{ torrent.added ? torrent.added.substring(0, 10) : '' }}</td>
                <td class="py-2 pl-2 text-right">
                  <ui-btn
                    small
                    :color="isSelected(torrent) ? 'bg-success' : 'bg-primary'"
                    :disabled="!!selectedTorrent && !isSelected(torrent)"
                    @click="toggleSelect(torrent)"
                  >
                    {{ isSelected(torrent) ? '✓' : 'Get' }}
                  </ui-btn>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    book: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      searching: false,
      searched: false,
      searchError: null,
      searchTitle: '',
      searchAuthor: '',
      results: [],
      downloadingId: null,
      selectedTorrent: null,
      selectedLibraryId: null,
      selectedFolderId: null,
      libraries: []
    }
  },
  computed: {
    show: {
      get() { return this.value },
      set(val) { this.$emit('input', val) }
    },
    authorName() {
      return this.book.authors?.[0]?.name || ''
    },
    selectedLibrary() {
      return this.libraries.find((l) => l.id === this.selectedLibraryId)
    },
    libraryDropdownItems() {
      return this.libraries.map((l) => ({ text: l.name, value: l.id }))
    },
    folderDropdownItems() {
      return (this.selectedLibrary?.folders || []).map((f) => ({ text: f.fullPath, value: f.id }))
    }
  },
  watch: {
    value(newVal) {
      if (newVal && this.book?.title) {
        this.searchTitle = this.book.title
        this.searchAuthor = this.authorName
        this.results = []
        this.searched = false
        this.searchError = null
        this.selectedTorrent = null
        this.search()
        this.loadLibraries()
      }
    }
  },
  methods: {
    isSelected(torrent) {
      return this.selectedTorrent?.id === torrent.id
    },
    rowClass(torrent) {
      if (!this.selectedTorrent) return 'hover:bg-white/5'
      return this.isSelected(torrent) ? 'bg-success/10' : 'opacity-40'
    },
    toggleSelect(torrent) {
      this.selectedTorrent = this.isSelected(torrent) ? null : torrent
    },
    onLibraryChange() {
      this.selectedFolderId = this.selectedLibrary?.folders?.[0]?.id || null
    },
    async loadLibraries() {
      const data = await this.$axios.$get('/api/libraries').catch(() => null)
      this.libraries = (data?.libraries || []).filter((l) => l.mediaType === 'book')
      if (this.libraries.length && !this.selectedLibraryId) {
        this.selectedLibraryId = this.libraries[0].id
        this.selectedFolderId = this.libraries[0].folders?.[0]?.id || null
      }
    },
    async search() {
      if (!this.searchTitle) return
      this.searching = true
      this.searchError = null
      this.results = []
      this.selectedTorrent = null
      try {
        const data = await this.$axios.$post('/api/discovery/mam-search', {
          title: this.searchTitle,
          author: this.searchAuthor
        })
        this.results = data.results || []
      } catch (error) {
        this.searchError = error.response?.data || 'Search failed'
      } finally {
        this.searching = false
        this.searched = true
      }
    },
    async confirmDownload() {
      if (!this.selectedTorrent || !this.selectedLibraryId || !this.selectedFolderId) return
      this.downloadingId = this.selectedTorrent.id
      try {
        await this.$axios.$post('/api/discovery/download', {
          bookData: this.book,
          torrentUrl: this.selectedTorrent.torrentUrl,
          libraryId: this.selectedLibraryId,
          libraryFolderId: this.selectedFolderId
        })
        this.$toast.success('Torrent sent to qBittorrent!')
        this.show = false
      } catch (error) {
        this.$toast.error(error.response?.data || 'Download failed')
      } finally {
        this.downloadingId = null
      }
    }
  }
}
</script>
