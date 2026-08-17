<script setup lang="ts">
import QualityIcon from "./QualityIcon.vue";
defineProps<{ state: "loading" | "fresh" | "stale" | "reconnecting" | "error"; message?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="state === 'stale' || state === 'reconnecting' || state === 'error'" class="connection-banner" :class="`connection-${state}`" role="status" aria-live="polite">
    <QualityIcon :name="state === 'error' ? 'alert' : 'refresh'" :size="17" />
    <span><strong>{{ state === 'stale' ? 'Data may be stale.' : state === 'reconnecting' ? 'Refreshing data…' : 'Unable to connect.' }}</strong> {{ message }}</span>
    <button v-if="state !== 'reconnecting'" class="text-button" type="button" @click="$emit('retry')">Try again</button>
  </div>
</template>
