<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { formatDate, useResource } from "../composables";
import { useQualityApi } from "../context";
import ConnectionBanner from "../components/ConnectionBanner.vue";
import PageHeader from "../components/PageHeader.vue";
import ResourceState from "../components/ResourceState.vue";
import StatusBadge from "../components/StatusBadge.vue";

const api = useQualityApi();
const status = ref(""); const environment = ref(""); const testType = ref("");
const resource = useResource(signal => api.runs({ status: status.value, environment: environment.value, testType: testType.value }, signal));
let filterTimer: number | undefined;
watch([status, environment, testType], () => { window.clearTimeout(filterTimer); filterTimer = window.setTimeout(() => resource.load(true), 180); });
onMounted(() => resource.load());
</script>

<template><section class="page">
  <PageHeader title="Test history" subtitle="Explore completed and in-progress quality runs" :updated-at="resource.lastUpdated.value" @refresh="resource.load(true)"/>
  <ConnectionBanner :state="resource.state.value" :message="resource.error.value" @retry="resource.load()"/>
  <div class="filter-bar panel"><label><span>Test type</span><select v-model="testType"><option value="">All tests</option><option value="quick_health">Quick health</option><option value="load">Load</option><option value="stress">Stress</option><option value="spike">Spike</option><option value="soak">Soak</option><option value="security">Security</option></select></label><label><span>Environment</span><select v-model="environment"><option value="">All environments</option><option value="local">Local</option><option value="staging">Staging</option><option value="production">Production</option></select></label><label><span>Status</span><select v-model="status"><option value="">All statuses</option><option value="queued">Queued</option><option value="running">Running</option><option value="passed">Passed</option><option value="warning">Warning</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label></div>
  <ResourceState :state="resource.state.value" :message="resource.error.value" :empty="resource.data.value?.items.length === 0" @retry="resource.load()"><article class="panel table-panel"><div class="table-heading"><strong>{{ resource.data.value?.total ?? 0 }} runs</strong><span>Newest first</span></div><div class="responsive-table"><table><thead><tr><th>Started</th><th>Test</th><th>Environment</th><th>Status</th><th>Score</th><th>Duration</th><th><span class="sr-only">Open</span></th></tr></thead><tbody><tr v-for="run in resource.data.value?.items" :key="run.id"><td data-label="Started">{{ formatDate(run.createdAt) }}</td><td data-label="Test"><strong>{{ run.displayName }}</strong><small v-if="run.release">{{ run.release }}</small></td><td data-label="Environment"><span class="environment-name"><span class="environment-dot"/>{{ run.environment }}</span></td><td data-label="Status"><StatusBadge :status="run.status"/></td><td data-label="Score"><strong class="score-cell">{{ run.score ?? '—' }}</strong></td><td data-label="Duration">{{ run.duration ?? '—' }}</td><td><RouterLink class="row-link" :to="`/admin/system-quality/history/${run.id}`" :aria-label="`View ${run.displayName} details`">→</RouterLink></td></tr></tbody></table></div></article></ResourceState>
</section></template>
