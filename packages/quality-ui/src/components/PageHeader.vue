<script setup lang="ts">
import QualityIcon from "./QualityIcon.vue";
defineProps<{ title: string; subtitle: string; updatedAt?: Date; refreshing?: boolean }>();
defineEmits<{ refresh: [] }>();
</script>

<template>
  <header class="page-header">
    <div><h1>{{ title }}</h1><p>{{ subtitle }}</p></div>
    <div class="page-header-actions"><slot/><span v-if="updatedAt" class="updated-at">Updated {{ updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span><button class="icon-button" type="button" :disabled="refreshing" aria-label="Refresh data" @click="$emit('refresh')"><QualityIcon name="refresh" :size="18"/></button></div>
  </header>
</template>
