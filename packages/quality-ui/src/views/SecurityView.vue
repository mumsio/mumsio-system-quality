<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { formatDate, useResource } from "../composables";
import { useQualityApi } from "../context";
import ConnectionBanner from "../components/ConnectionBanner.vue";
import PageHeader from "../components/PageHeader.vue";
import ResourceState from "../components/ResourceState.vue";
import StatusBadge from "../components/StatusBadge.vue";
const api = useQualityApi(); const severity = ref(""); const selected = ref<string>();
const resource = useResource(signal => api.findings(signal));
const items = computed(() => resource.data.value?.items.filter(item => !severity.value || item.severity === severity.value) ?? []);
const activeFinding = computed(() => resource.data.value?.items.find(item => item.id === selected.value));
onMounted(() => resource.load());
</script>
<template><section class="page"><PageHeader title="Security findings" subtitle="Prioritized, normalized findings from approved scanners" :updated-at="resource.lastUpdated.value" @refresh="resource.load(true)"/><ConnectionBanner :state="resource.state.value" :message="resource.error.value" @retry="resource.load()"/><ResourceState :state="resource.state.value" :message="resource.error.value" @retry="resource.load()"><template v-if="resource.data.value"><div class="severity-overview"><button v-for="level in ['critical','high','medium','low','info'] as const" :key="level" type="button" :class="[`severity-${level}`, { selected: severity === level }]" @click="severity = severity === level ? '' : level"><strong>{{ resource.data.value.totals[level] }}</strong><span>{{ level }}</span></button></div><article class="panel findings-panel"><div class="panel-heading"><span class="section-label">{{ severity ? `${severity} findings` : 'All findings' }}</span><span class="muted">{{ items.length }} results</span></div><div class="finding-list"><button v-for="finding in items" :key="finding.id" type="button" @click="selected = selected === finding.id ? undefined : finding.id"><span class="finding-mark" :class="`severity-${finding.severity}`">{{ finding.severity.slice(0,1).toUpperCase() }}</span><span class="finding-main"><strong>{{ finding.title }}</strong><small>{{ finding.system }} · {{ finding.source }}</small></span><StatusBadge :status="finding.status"/><time>{{ formatDate(finding.detectedAt) }}</time><span class="chevron">{{ selected === finding.id ? '−' : '+' }}</span><span v-if="selected === finding.id" class="finding-details"><span><b>Description</b>{{ finding.description ?? 'No additional description was supplied.' }}</span><span><b>Recommended action</b>{{ finding.recommendation ?? 'Review this finding in the source scanner.' }}</span></span></button></div></article></template></ResourceState><div v-if="activeFinding" class="sr-only" aria-live="polite">Opened details for {{ activeFinding.title }}</div></section></template>
