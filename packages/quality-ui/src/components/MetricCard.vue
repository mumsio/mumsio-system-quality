<script setup lang="ts">
import QualityIcon from "./QualityIcon.vue";
import StatusBadge from "./StatusBadge.vue";
import type { DimensionScore } from "../types";
defineProps<{ dimension: DimensionScore }>();
</script>

<template>
  <article class="metric-card">
    <div class="metric-icon" :class="`accent-${dimension.id}`"><QualityIcon :name="dimension.icon ?? dimension.id" :size="27"/></div>
    <span class="eyebrow">{{ dimension.label }}</span>
    <div class="metric-score"><strong>{{ dimension.status === 'unknown' ? '—' : dimension.score }}</strong><span v-if="dimension.status !== 'unknown'">/100</span></div>
    <StatusBadge :status="dimension.status" :label="dimension.status === 'unknown' ? 'Not tested' : undefined" />
    <span v-if="dimension.change !== undefined" class="metric-change" :class="dimension.change >= 0 ? 'positive' : 'negative'">{{ dimension.change >= 0 ? '↑' : '↓' }} {{ Math.abs(dimension.change) }} pts</span>
  </article>
</template>
