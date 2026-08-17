<script setup lang="ts">
import QualityIcon from "./QualityIcon.vue";
defineProps<{ state: string; message?: string; empty?: boolean }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="state === 'loading'" class="resource-state" role="status"><span class="spinner"/><span>Loading quality data…</span></div>
  <div v-else-if="state === 'error'" class="resource-state resource-error" role="alert"><QualityIcon name="alert" :size="28"/><strong>Quality data is unavailable</strong><span>{{ message }}</span><button class="button secondary" type="button" @click="$emit('retry')">Try again</button></div>
  <div v-else-if="empty" class="resource-state"><QualityIcon name="search" :size="28"/><strong>No results found</strong><span>Try changing the filters or run a test.</span></div>
  <slot v-else />
</template>
