<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { createIdempotencyKey, formatDate, useResource } from "../composables";
import { useQualityApi } from "../context";
import type { QualityEnvironment, TestDefinition, TestType } from "../types";
import ConnectionBanner from "../components/ConnectionBanner.vue";
import MetricCard from "../components/MetricCard.vue";
import PageHeader from "../components/PageHeader.vue";
import QualityIcon from "../components/QualityIcon.vue";
import ResourceState from "../components/ResourceState.vue";
import ScoreGauge from "../components/ScoreGauge.vue";
import Sparkline from "../components/Sparkline.vue";
import StatusBadge from "../components/StatusBadge.vue";

const api = useQualityApi();
const router = useRouter();
const environment = ref<QualityEnvironment>("staging");
const actionError = ref<string>();
const runningType = ref<TestType>();
const resource = useResource(async (signal) => {
  const [dashboard, catalog] = await Promise.all([api.dashboard(environment.value, signal), api.catalog(signal)]);
  return { dashboard, catalog };
});

const data = computed(() => resource.data.value?.dashboard);
const quickActions = computed(() => resource.data.value?.catalog.slice(0, 6) ?? []);
const severityTotals = computed(() => {
  const result = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of data.value?.findings ?? []) result[finding.severity] += 1;
  return result;
});

async function runTest(definition: TestDefinition): Promise<void> {
  actionError.value = undefined;
  runningType.value = definition.testType;
  try {
    const run = await api.createRun(definition.testType, environment.value, createIdempotencyKey());
    await router.push(`/admin/system-quality/history/${run.id}`);
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : "The test could not be started";
  } finally { runningType.value = undefined; }
}

onMounted(() => resource.load());
watch(environment, () => resource.load(true));
</script>

<template>
  <section class="page dashboard-page">
    <PageHeader title="System Testing Dashboard" subtitle="Quality, performance and security overview" :updated-at="resource.lastUpdated.value" :refreshing="resource.state.value === 'reconnecting'" @refresh="resource.load(true)">
      <label class="environment-select"><span>Environment</span><select v-model="environment" aria-label="Environment"><option value="local">Local</option><option value="staging">Staging</option><option value="production">Production</option></select></label>
      <RouterLink class="button primary" to="/admin/system-quality/run"><QualityIcon name="play" :size="16"/> Run test</RouterLink>
    </PageHeader>
    <ConnectionBanner :state="resource.state.value" :message="resource.error.value" @retry="resource.load()" />
    <ResourceState :state="resource.state.value" :message="resource.error.value" @retry="resource.load()">
      <template v-if="data">
        <div class="score-grid">
          <article class="overall-card panel">
            <span class="eyebrow">Overall quality score</span>
            <ScoreGauge v-if="data.hasData" :score="data.overallScore" />
            <div v-else class="empty-score" aria-label="Overall quality has not been tested"><strong>—</strong><span>/100</span></div>
            <strong class="quality-word" :class="{ neutral: !data.hasData }">{{ !data.hasData ? 'Awaiting first test' : data.overallScore >= 90 ? 'Excellent' : data.overallScore >= 75 ? 'Good' : 'Needs attention' }}</strong>
            <span v-if="data.scoreChange !== undefined" class="metric-change" :class="data.scoreChange >= 0 ? 'positive' : 'negative'">{{ data.scoreChange >= 0 ? '↑' : '↓' }} {{ Math.abs(data.scoreChange) }} pts vs last run</span>
            <Sparkline :values="data.trend" />
          </article>
          <MetricCard v-for="dimension in data.dimensions" :key="dimension.id" :dimension="dimension" />
        </div>

        <article class="panel system-health-panel">
          <div class="panel-heading"><div><span class="section-label">Mumsio system health</span><span class="system-health-caption">{{ data.hasData ? 'Latest verified result' : 'Run a test to establish the baseline' }}</span></div></div>
          <div class="system-health-grid">
            <div v-for="system in data.systems" :key="system.id" class="system-health-card" :class="`system-${system.status}`">
              <span class="system-status" :class="system.status"/>
              <div><strong>{{ system.name }}</strong><small>{{ system.status === 'unknown' ? 'Not tested' : system.status }}</small></div>
              <b>{{ system.score ?? '—' }}<small v-if="system.score !== undefined">/100</small></b>
            </div>
          </div>
        </article>

        <div class="dashboard-columns">
          <div class="dashboard-primary">
            <article v-if="data.latestRun" class="panel summary-panel">
              <div class="panel-heading"><div><span class="section-label">Last test summary</span><StatusBadge :status="data.latestRun.status" /></div><RouterLink :to="`/admin/system-quality/history/${data.latestRun.id}`">View report →</RouterLink></div>
              <div class="summary-layout">
                <div class="run-identity"><div class="large-icon"><QualityIcon name="speed" :size="28"/></div><div><strong>{{ data.latestRun.displayName }}</strong><span>{{ data.latestRun.environment }} · {{ data.latestRun.duration ?? '—' }}</span></div></div>
                <dl class="metric-list"><div v-for="metric in data.latestRun.metrics?.slice(0, 6)" :key="metric.label"><dt>{{ metric.label }}</dt><dd :class="metric.tone">{{ metric.value }}</dd></div></dl>
              </div>
              <div v-if="data.latestRun.summary" class="summary-note">{{ data.latestRun.summary }}</div>
            </article>

            <div class="two-column-panels">
              <article v-if="data.releaseComparison" class="panel compact-panel">
                <div class="panel-heading"><span class="section-label">Release comparison</span><RouterLink to="/admin/system-quality/releases">Compare →</RouterLink></div>
                <div class="release-versions"><div><strong>{{ data.releaseComparison.base.version }}</strong><span>{{ data.releaseComparison.base.score }} score</span></div><span>→</span><div class="current-release"><strong>{{ data.releaseComparison.current.version }}</strong><span>{{ data.releaseComparison.current.score }} score</span></div></div>
                <div class="mini-table"><div v-for="metric in data.releaseComparison.metrics.slice(0, 4)" :key="metric.label"><span>{{ metric.label }}</span><span>{{ metric.current }}</span><span :class="metric.change >= 0 ? 'positive' : 'negative'">{{ metric.change >= 0 ? '+' : '' }}{{ metric.change }}%</span></div></div>
              </article>
              <article class="panel compact-panel">
                <div class="panel-heading"><span class="section-label">Recent test history</span><RouterLink to="/admin/system-quality/history">View all →</RouterLink></div>
                <div class="run-list"><RouterLink v-for="run in data.recentRuns.slice(0, 5)" :key="run.id" :to="`/admin/system-quality/history/${run.id}`"><div><strong>{{ run.displayName }}</strong><span>{{ formatDate(run.createdAt) }}</span></div><StatusBadge :status="run.status"/><span class="run-score">{{ run.score ?? '—' }}</span></RouterLink></div>
              </article>
            </div>
          </div>

          <aside class="dashboard-secondary">
            <article class="panel quick-actions-panel">
              <div class="panel-heading"><span class="section-label">Quick actions</span><RouterLink to="/admin/system-quality/run">All tests →</RouterLink></div>
              <p v-if="actionError" class="inline-error" role="alert">{{ actionError }}</p>
              <div class="quick-actions">
                <button v-for="definition in quickActions" :key="definition.testType" type="button" :disabled="!data.capabilities.run || !definition.enabled || !definition.allowedEnvironments.includes(environment) || runningType !== undefined" :title="definition.disabledReason" @click="runTest(definition)">
                  <QualityIcon :name="definition.icon ?? (definition.testType === 'security' ? 'shield' : definition.testType === 'soak' ? 'clock' : 'rocket')" :size="24"/><span><strong>{{ definition.name }}</strong><small>{{ definition.description }}</small></span><span v-if="runningType === definition.testType" class="spinner"/>
                </button>
              </div>
            </article>
            <article class="panel security-summary">
              <div class="panel-heading"><span class="section-label">Security findings</span><RouterLink to="/admin/system-quality/security">View all →</RouterLink></div>
              <div class="severity-grid"><div v-for="severity in ['critical','high','medium','low','info'] as const" :key="severity" :class="`severity-${severity}`"><strong>{{ severityTotals[severity] }}</strong><span>{{ severity }}</span></div></div>
              <ul class="finding-preview"><li v-for="finding in data.findings.slice(0, 3)" :key="finding.id"><span :class="`finding-mark severity-${finding.severity}`">{{ finding.severity.slice(0,1).toUpperCase() }}</span><div><strong>{{ finding.title }}</strong><span>{{ finding.source }} · {{ finding.system }}</span></div></li></ul>
            </article>
          </aside>
        </div>

        <article v-if="data.alerts.length" class="panel alerts-panel"><div class="panel-heading"><span class="section-label">Recent alerts <b>{{ data.alerts.length }}</b></span></div><div class="alerts-row"><div v-for="alert in data.alerts.slice(0, 3)" :key="alert.id"><QualityIcon name="alert" :size="17"/><span><strong>{{ alert.title }}</strong><small>{{ alert.release }} · {{ formatDate(alert.occurredAt) }}</small></span><StatusBadge :status="alert.severity"/></div></div></article>
      </template>
    </ResourceState>
  </section>
</template>
