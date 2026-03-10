<template>
  <div class="relative group flex flex-col" :style="{ width: cardWidth + 'px' }">
    <!-- Cover image area -->
    <div class="relative overflow-hidden rounded-sm bg-primary flex-shrink-0" :style="{ width: cardWidth + 'px', height: coverHeight + 'px' }">
      <img v-if="book.cover" :src="book.cover" class="w-full h-full object-cover opacity-40 group-hover:opacity-55 transition-opacity duration-200" :alt="book.title" />
      <div v-else class="w-full h-full bg-primary flex items-center justify-center">
        <span class="material-symbols text-4xl text-white/20">auto_stories</span>
      </div>

      <!-- Dim overlay -->
      <div class="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-200" />

      <!-- Discovery badge top-right -->
      <div class="absolute top-1 right-1 bg-black/60 rounded-full p-0.5">
        <span class="material-symbols text-sm text-blue-300">cloud_download</span>
      </div>

      <!-- Search/download button — shown on hover -->
      <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button class="flex items-center gap-1 bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-2 py-1 rounded shadow-lg" @click.stop="$emit('click', book)">
          <span class="material-symbols text-sm">search</span>
          Find
        </button>
      </div>
    </div>

    <!-- Title + metadata below card -->
    <div class="pt-1 px-0.5">
      <p class="text-xs text-white/60 truncate leading-4">{{ book.title }}</p>
      <p v-if="book.seriesPosition" class="text-xs text-blue-400/70 leading-4">#{{ book.seriesPosition }}</p>
      <p v-else-if="book.publishedYear" class="text-xs text-white/30 leading-4">{{ book.publishedYear }}</p>
    </div>

    <!-- Always-visible download button below the card -->
    <button class="mt-1 w-full flex items-center justify-center gap-1 border border-blue-500/50 hover:border-blue-400 hover:bg-blue-500/10 text-blue-400 text-xs rounded py-0.5 transition-colors duration-150" @click.stop="$emit('click', book)">
      <span class="material-symbols text-xs">search</span>
      Search MAM
    </button>
  </div>
</template>

<script>
export default {
  props: {
    book: {
      type: Object,
      required: true
    },
    cardWidth: {
      type: Number,
      default: 120
    },
    coverHeight: {
      type: Number,
      default: 180
    }
  },
  emits: ['click']
}
</script>
