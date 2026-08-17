<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, RouterView } from "vue-router";
import QualityIcon from "./QualityIcon.vue";

const menuOpen = ref(false);
const navigation = [
  { to: "/admin/system-quality", label: "System Testing", icon: "pulse", exact: true },
  { to: "/admin/system-quality/run", label: "Run Tests", icon: "play" },
  { to: "/admin/system-quality/history", label: "Test History", icon: "history" },
  { to: "/admin/system-quality/releases", label: "Release Comparison", icon: "release" },
  { to: "/admin/system-quality/security", label: "Security Findings", icon: "shield" },
  { to: "/admin/system-quality/settings", label: "Settings", icon: "settings" },
];
</script>

<template>
  <div class="quality-shell">
    <button class="mobile-menu" type="button" aria-label="Open navigation" @click="menuOpen = !menuOpen"><QualityIcon name="pulse"/><span>Quality Center</span></button>
    <aside class="sidebar" :class="{ open: menuOpen }">
      <RouterLink to="/admin/system-quality" class="brand" @click="menuOpen = false"><span class="brand-mark">♡</span><strong>Mumsio</strong></RouterLink>
      <div class="sidebar-kicker">Quality Center</div>
      <nav aria-label="Quality Center navigation">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" :class="{ exact: item.exact }" @click="menuOpen = false"><QualityIcon :name="item.icon" :size="19"/><span>{{ item.label }}</span></RouterLink>
      </nav>
      <div class="sidebar-foot"><span class="environment-dot"/>Mock adapters<span class="muted">Standalone</span></div>
    </aside>
    <button v-if="menuOpen" class="sidebar-scrim" aria-label="Close navigation" @click="menuOpen = false" />
    <main class="quality-main"><RouterView /></main>
  </div>
</template>
