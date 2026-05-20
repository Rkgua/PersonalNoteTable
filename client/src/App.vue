<script setup>
import { onMounted } from "vue";
import QApanel from "./components/QApanel.vue";
import { settings, applyTheme } from "./store/settings";

onMounted(() => {
  applyTheme();
});
</script>

<template>
  <router-view />
  <QApanel v-if="settings.showQA" />
</template>
