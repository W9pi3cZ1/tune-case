<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useLog } from '../composables/useLog';

const { logs, clear, count } = useLog();
const box = ref<HTMLDivElement | null>(null);

const rendered = computed(() => logs.value.map(e => ({
  key: `${e.t.getTime()}-${e.msg.slice(0, 16)}`,
  time: e.t.toTimeString().slice(0, 8),
  level: e.level,
  msg: e.msg,
})));

watch(logs, async () => {
  await nextTick();
  const el = box.value;
  if (!el) return;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
  if (atBottom) el.scrollTop = el.scrollHeight;
}, { deep: true });
</script>

<template>
  <div class="row" style="margin-bottom:8px">
    <button type="button" @click="clear">清空日志</button>
    <span class="muted small" style="margin-left:auto">共 {{ count }} 条</span>
  </div>
  <div ref="box" class="log-box">
    <div v-if="rendered.length === 0" class="empty">暂无日志。</div>
    <div
      v-for="e in rendered"
      :key="e.key"
      class="log-line"
      :class="'log-' + e.level"
    >[{{ e.time }}] {{ e.msg }}</div>
  </div>
</template>
