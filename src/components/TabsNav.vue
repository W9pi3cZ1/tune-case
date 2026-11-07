<script setup lang="ts">
import type { TabName } from '../types';

defineProps<{ current: TabName }>();
const emit = defineEmits<{ select: [tab: TabName] }>();

const tabs: { key: TabName; label: string }[] = [
  { key: 'main', label: '下载' },
  { key: 'settings', label: '配置' },
  { key: 'logs', label: '日志' },
  { key: 'account', label: '账号' },
];
</script>

<template>
  <nav class="tabs" role="tablist">
    <ul>
      <li
        v-for="t in tabs"
        :key="t.key"
        role="tab"
        :aria-selected="current === t.key ? 'true' : 'false'"
        @click="emit('select', t.key)"
      >
        {{ t.label }}
      </li>
    </ul>
  </nav>
</template>
