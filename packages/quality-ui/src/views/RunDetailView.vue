<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { formatDate, startPolling, useResource } from "../composables";
import { useQualityApi } from "../context";
import ConnectionBanner from "../components/ConnectionBanner.vue";
import PageHeader from "../components/PageHeader.vue";
import QualityIcon from "../components/QualityIcon.vue";
import ResourceState from "../components/ResourceState.vue";
import ScoreGauge from "../components/ScoreGauge.vue";
import StatusBadge from "../components/StatusBadge.vue";

const api = useQualityApi(); const route = useRoute(); const cancelling = ref(false); const cancelError = ref<string>();
const id = computed(() => String(route.params.id));
const resource = useResource(signal => api.run(id.value, signal));
const active = computed(() => resource.data.value?.status === "queued" || resource.data.value?.status === "running");
let stopPolling: (() => void) | undefined;
async function cancel(): Promise<void> { cancelling.value = true; cancelError.value = undefined; try { resource.data.value = await api.cancelRun(id.value); } catch (cause) { cancelError.value = cause instanceof Error ? cause.message : "Could not cancel this run"; } finally { cancelling.value = false; } }
onMounted(async () => { await resource.load(); stopPolling = startPolling(() => { if (active.value) void resource.load(true); }, 3000); });
onBeforeUnmount(() => stopPolling?.());
</script>

<template><section class="page">
  <div class="breadcrumbs"><RouterLink to="/admin/system-quality/history">Test history</RouterLink><span>/</span><span>{{ resource.data.value?.displayName ?? 'Run details' }}</span></div>
  <PageHeader title="Test run details" subtitle="Status, results and normalized measurements" :updated-at="resource.lastUpdated.value" @refresh="resource.load(true)"><button v-if="active" class="button danger" type="button" :disabled="cancelling" @click="cancel">{{ cancelling ? 'Cancelling…' : 'Cancel run' }}</button></PageHeader>
  <ConnectionBanner :state="resource.state.value" :message="resource.error.value" @retry="resource.load()"/><p v-if="cancelError" class="inline-error" role="alert">{{ cancelError }}</p>
  <ResourceState :state="resource.state.value" :message="resource.error.value" @retry="resource.load()"><template v-if="resource.data.value"><article class="panel detail-hero"><div class="run-identity"><div class="large-icon"><QualityIcon name="speed" :size="31"/></div><div><div class="title-with-status"><h2>{{ resource.data.value.displayName }}</h2><StatusBadge :status="resource.data.value.status"/></div><span>{{ resource.data.value.environment }} · {{ resource.data.value.release ?? 'No release reference' }}</span></div></div><ScoreGauge v-if="resource.data.value.score !== undefined" :score="resource.data.value.score" compact/></article>
  <article v-if="active" class="panel progress-panel"><div><strong>{{ resource.data.value.status === 'queued' ? 'Waiting for an available worker' : 'Test is running' }}</strong><span>{{ resource.data.value.progress ?? 0 }}% complete</span></div><div class="progress-track"><span :style="{ width: `${resource.data.value.progress ?? 4}%` }"/></div><p>This page refreshes automatically while the test is active.</p></article>
  <div class="detail-grid"><article class="panel"><div class="panel-heading"><span class="section-label">Run summary</span></div><dl class="detail-list"><div><dt>Run ID</dt><dd><code>{{ resource.data.value.id }}</code></dd></div><div><dt>Environment</dt><dd>{{ resource.data.value.environment }}</dd></div><div><dt>Created</dt><dd>{{ formatDate(resource.data.value.createdAt) }}</dd></div><div><dt>Started</dt><dd>{{ formatDate(resource.data.value.startedAt) }}</dd></div><div><dt>Completed</dt><dd>{{ formatDate(resource.data.value.completedAt) }}</dd></div><div><dt>Duration</dt><dd>{{ resource.data.value.duration ?? '—' }}</dd></div></dl></article><article class="panel"><div class="panel-heading"><span class="section-label">Measurements</span></div><dl class="metric-list detail-metrics"><div v-for="metric in resource.data.value.metrics" :key="metric.label"><dt>{{ metric.label }}</dt><dd :class="metric.tone">{{ metric.value }} <small v-if="metric.comparison">{{ metric.comparison }}</small></dd></div></dl><p v-if="!resource.data.value.metrics?.length" class="muted">Measurements appear after the runner reports results.</p></article></div>
  <article v-if="resource.data.value.summary" class="panel result-summary"><QualityIcon :name="resource.data.value.status === 'failed' ? 'alert' : 'check'" :size="24"/><div><strong>Result summary</strong><p>{{ resource.data.value.summary }}</p></div></article></template></ResourceState>
</section></template>
