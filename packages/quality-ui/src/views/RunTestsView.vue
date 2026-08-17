<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { createIdempotencyKey, useResource } from "../composables";
import { useQualityApi } from "../context";
import type { QualityEnvironment, TestDefinition, TestType } from "../types";
import ConnectionBanner from "../components/ConnectionBanner.vue";
import PageHeader from "../components/PageHeader.vue";
import QualityIcon from "../components/QualityIcon.vue";
import ResourceState from "../components/ResourceState.vue";

const api = useQualityApi(); const router = useRouter();
const environment = ref<QualityEnvironment>("staging");
const running = ref<TestType>(); const error = ref<string>();
const resource = useResource(async signal => {
  const [catalog, dashboard] = await Promise.all([api.catalog(signal), api.dashboard(environment.value, signal)]);
  return { catalog, capabilities: dashboard.capabilities };
});
const groups = computed(() => [
  { id: "traffic", title: "Traffic tests", description: "Controlled traffic profiles for capacity and response behavior." },
  { id: "non_functional", title: "Quality checks", description: "Security, reliability, efficiency and performance verification." },
  { id: "combined", title: "Combined suites", description: "Versioned groups of predefined tests for system and release confidence." },
].map(group => ({ ...group, items: resource.data.value?.catalog.filter(item => item.category === group.id) ?? [] })));

async function start(item: TestDefinition): Promise<void> {
  running.value = item.testType; error.value = undefined;
  try { const run = await api.createRun(item.testType, environment.value, createIdempotencyKey()); await router.push(`/admin/system-quality/history/${run.id}`); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "Unable to start test"; }
  finally { running.value = undefined; }
}
function unavailableReason(item: TestDefinition): string | undefined {
  if (!resource.data.value?.capabilities.run) return "Your account cannot run tests.";
  if (!item.enabled) return item.disabledReason ?? "This test is disabled by server policy.";
  if (!item.allowedEnvironments.includes(environment.value)) return `${item.name} is not allowed in ${environment.value}.`;
  return undefined;
}
onMounted(() => resource.load());
</script>

<template><section class="page">
  <PageHeader title="Run tests" subtitle="Start an approved, server-defined quality check" :updated-at="resource.lastUpdated.value" @refresh="resource.load(true)"><label class="environment-select"><span>Target environment</span><select v-model="environment"><option value="local">Local</option><option value="staging">Staging</option><option value="production">Production</option></select></label></PageHeader>
  <ConnectionBanner :state="resource.state.value" :message="resource.error.value" @retry="resource.load()"/>
  <div class="safety-note"><QualityIcon name="shield" :size="22"/><div><strong>Safety controls are enforced by the server</strong><span>Only predefined profiles are available. Changing the environment never bypasses policy, concurrency or authorization checks.</span></div></div>
  <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
  <ResourceState :state="resource.state.value" :message="resource.error.value" @retry="resource.load()"><div class="catalog-groups"><section v-for="group in groups" :key="group.id" class="catalog-group"><div class="group-heading"><h2>{{ group.title }}</h2><p>{{ group.description }}</p></div><div class="catalog-grid"><article v-for="item in group.items" :key="item.testType" class="test-card" :class="{ unavailable: unavailableReason(item) }"><div class="test-card-top"><span class="large-icon"><QualityIcon :name="item.icon ?? (item.testType === 'security' ? 'shield' : item.testType === 'soak' ? 'clock' : 'rocket')" :size="27"/></span><span class="intensity" :class="`intensity-${item.intensity}`">{{ item.intensity ?? 'standard' }}</span></div><h3>{{ item.name }}</h3><p>{{ item.description }}</p><div class="test-meta"><span><QualityIcon name="clock" :size="15"/>{{ item.estimatedDuration ?? 'Duration varies' }}</span><span>{{ item.allowedEnvironments.join(' · ') }}</span></div><p v-if="unavailableReason(item)" class="policy-reason"><QualityIcon name="lock" :size="15"/>{{ unavailableReason(item) }}</p><button class="button primary full" type="button" :disabled="!!unavailableReason(item) || running !== undefined" @click="start(item)"><span v-if="running === item.testType" class="spinner"/><QualityIcon v-else name="play" :size="15"/>{{ running === item.testType ? 'Starting…' : `Run ${item.name}` }}</button></article></div></section></div></ResourceState>
</section></template>
