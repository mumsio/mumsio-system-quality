<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ score: number; compact?: boolean }>();
const dash = computed(() => `${Math.max(0, Math.min(100, props.score))} 100`);
const tone = computed(() => props.score >= 90 ? "good" : props.score >= 75 ? "warning" : "bad");
</script>

<template>
  <div class="score-gauge" :class="[{ compact }, `gauge-${tone}`]" :aria-label="`Quality score ${score} out of 100`">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="gauge-track" cx="60" cy="60" r="49" pathLength="100"/><circle class="gauge-value" cx="60" cy="60" r="49" pathLength="100" :stroke-dasharray="dash"/></svg>
    <div class="gauge-label"><strong>{{ score }}</strong><span>/100</span></div>
  </div>
</template>
