<script setup lang="ts">
withDefaults(defineProps<{ name?: string; size?: number }>(), { name: "pulse", size: 20 });
</script>

<template>
  <svg class="q-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'home'"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></template>
    <template v-else-if="name === 'play'"><path d="M7 4v16l13-8z"/></template>
    <template v-else-if="name === 'history'"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></template>
    <template v-else-if="name === 'release'"><path d="m12 3 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4"/></template>
    <template v-else-if="name === 'shield'"><path d="M12 3 4.5 6v5c0 4.8 3 8.3 7.5 10 4.5-1.7 7.5-5.2 7.5-10V6z"/><path d="m9 12 2 2 4-4"/></template>
    <template v-else-if="name === 'settings'"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></template>
    <template v-else-if="name === 'speed'"><path d="M4.9 19a9 9 0 1 1 14.2 0"/><path d="m12 13 4-4"/><path d="M12 6v1M6.4 9.2l.9.5M17.6 9.2l-.9.5"/></template>
    <template v-else-if="name === 'leaf'"><path d="M20 4C12 4 5 7 5 13c0 3 2 5 5 5 6 0 9-7 10-14Z"/><path d="M4 21c2-5 6-9 11-12"/></template>
    <template v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></template>
    <template v-else-if="name === 'rocket'"><path d="M14 5c3-3 6-2 6-2s1 3-2 6l-6 6-5-5z"/><path d="m10 7-5 1-2 3 5 1M13 14l-1 5-3 2-1-5"/><circle cx="15.5" cy="7.5" r="1.5"/></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></template>
    <template v-else-if="name === 'alert'"><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/></template>
    <template v-else-if="name === 'check'"><path d="m5 12 4 4L19 6"/></template>
    <template v-else-if="name === 'refresh'"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></template>
    <template v-else-if="name === 'monitor'"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></template>
    <template v-else-if="name === 'search'"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></template>
    <template v-else><path d="M3 12h4l2.2-6 4.2 12 2.1-6H21"/></template>
  </svg>
</template>
