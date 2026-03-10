<template>
  <div>
    <app-settings-content header-text="Discovery Settings" description="Configure audiobook discovery, MyAnonamouse search, and qBittorrent download settings.">
      <div class="max-w-xl">
        <!-- Global toggles -->
        <h2 class="font-semibold mb-3">Discovery</h2>
        <div class="flex items-center py-2 gap-4">
          <ui-toggle-switch v-model="settings.discoveryEnabled" :disabled="saving" label="Enable Discovery" @input="(val) => update('discoveryEnabled', val)" />
          <p class="text-sm text-white/70">Enable audiobook discovery</p>
        </div>
        <div v-if="settings.discoveryEnabled" class="ml-6">
          <div class="flex items-center py-1 gap-4">
            <ui-toggle-switch v-model="settings.discoverAuthors" :disabled="saving" label="Discover for Authors" @input="(val) => update('discoverAuthors', val)" />
            <p class="text-sm text-white/70">Find missing books by tracked authors</p>
          </div>
          <div class="flex items-center py-1 gap-4">
            <ui-toggle-switch v-model="settings.discoverSeries" :disabled="saving" label="Discover for Series" @input="(val) => update('discoverSeries', val)" />
            <p class="text-sm text-white/70">Find missing entries in tracked series</p>
          </div>
        </div>

        <div class="w-full h-px bg-white/10 my-6" />

        <!-- MAM Credentials -->
        <h2 class="font-semibold mb-3">MyAnonamouse (MAM)</h2>

        <div class="mb-4">
          <ui-text-input-with-label v-model="settings.mouseholeUrl" label="Mousehole URL" :disabled="saving" class="mb-1" />
          <p class="text-xs text-white/40">URL of the <a href="https://github.com/t-mart/mousehole" target="_blank" class="underline">mousehole</a> container that manages your MAM session cookie (e.g. <code>http://localhost:5010</code>).</p>
        </div>

        <div class="flex items-center gap-3 mb-2">
          <ui-btn small :loading="testingMAM" @click="testMAM">Test MAM Connection</ui-btn>
          <span v-if="mamTestResult" :class="mamTestResult.success ? 'text-green-400' : 'text-red-400'" class="text-sm">{{ mamTestResult.success ? 'Connected!' : mamTestResult.error }}</span>
        </div>

        <div class="w-full h-px bg-white/10 my-6" />

        <!-- qBittorrent settings -->
        <h2 class="font-semibold mb-3">qBittorrent</h2>
        <div class="flex gap-3 mb-3">
          <ui-text-input-with-label v-model="settings.qbtHost" label="Host" :disabled="saving" class="grow" />
          <div class="w-28">
            <ui-text-input-with-label v-model.number="settings.qbtPort" label="Port" type="number" :disabled="saving" />
          </div>
        </div>
        <div class="flex gap-3 mb-3">
          <ui-text-input-with-label v-model="settings.qbtUsername" label="Username" :disabled="saving" class="grow" />
          <ui-text-input-with-label v-model="settings.qbtPassword" label="Password" type="password" :disabled="saving" class="grow" />
        </div>
        <div class="flex gap-3 mb-4">
          <ui-text-input-with-label v-model="settings.qbtCategory" label="Category" :disabled="saving" class="grow" />
          <div class="w-36">
            <ui-text-input-with-label v-model.number="settings.qbtSeedRatio" label="Seed Ratio" type="number" step="0.1" :disabled="saving" />
          </div>
        </div>

        <div class="flex items-center gap-3 mb-2">
          <ui-btn small :loading="testingQBT" @click="testQBT">Test qBittorrent Connection</ui-btn>
          <span v-if="qbtTestResult" :class="qbtTestResult.success ? 'text-green-400' : 'text-red-400'" class="text-sm">{{ qbtTestResult.success ? `Connected! v${qbtTestResult.version}` : qbtTestResult.error }}</span>
        </div>

        <div class="flex justify-end pt-6">
          <ui-btn :loading="saving" @click="save">Save Settings</ui-btn>
        </div>
      </div>
    </app-settings-content>
  </div>
</template>

<script>
export default {
  asyncData({ store, redirect }) {
    if (!store.getters['user/getIsAdminOrUp']) {
      redirect('/')
    }
  },
  data() {
    return {
      saving: false,
      testingMAM: false,
      testingQBT: false,
      mamTestResult: null,
      qbtTestResult: null,
      settings: {
        discoveryEnabled: false,
        discoverAuthors: true,
        discoverSeries: true,
        mouseholeUrl: 'http://localhost:5010',
        mamUsername: '',
        mamPassword: '',
        qbtHost: 'localhost',
        qbtPort: 8080,
        qbtUsername: 'admin',
        qbtPassword: '',
        qbtCategory: 'audiobooks',
        qbtSeedRatio: 1.0
      }
    }
  },
  async mounted() {
    await this.loadSettings()
  },
  methods: {
    async loadSettings() {
      const data = await this.$axios.$get('/api/settings/discovery').catch((err) => {
        console.error('Failed to load discovery settings', err)
        return null
      })
      if (data) {
        this.settings = { ...this.settings, ...data }
      }
    },
    update(key, val) {
      this.settings[key] = val
      this.save()
    },
    async save() {
      this.saving = true
      try {
        const data = await this.$axios.$patch('/api/settings/discovery', this.settings)
        this.settings = { ...this.settings, ...data }
        this.$toast.success('Discovery settings saved')
      } catch (err) {
        this.$toast.error('Failed to save discovery settings')
      } finally {
        this.saving = false
      }
    },
    async testMAM() {
      this.testingMAM = true
      this.mamTestResult = null
      try {
        await this.save()
        this.mamTestResult = await this.$axios.$post('/api/settings/discovery/test-mam')
      } catch (err) {
        this.mamTestResult = { success: false, error: err.response?.data || err.message }
      } finally {
        this.testingMAM = false
      }
    },
    async testQBT() {
      this.testingQBT = true
      this.qbtTestResult = null
      try {
        await this.save()
        this.qbtTestResult = await this.$axios.$post('/api/settings/discovery/test-qbt')
      } catch (err) {
        this.qbtTestResult = { success: false, error: err.response?.data || err.message }
      } finally {
        this.testingQBT = false
      }
    }
  }
}
</script>
