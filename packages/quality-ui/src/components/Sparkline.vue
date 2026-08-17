<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ values: number[] }>();
const points = computed(() => {
  if (!props.values.length) return "";
  const min = Math.min(...props.values); const max = Math.max(...props.values); const range = max - min || 1;
  return props.values.map((value, index) => `${(index / Math.max(1, props.values.length - 1)) * 100},${30 - ((value - min) / range) * 25}`).join(" ");
});
</script>
<template><svg class="sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline :points="points" fill="none" vector-effect="non-scaling-stroke"/></svg></template>
