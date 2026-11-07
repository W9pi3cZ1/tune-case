<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  text: string;
  /** 滚动速度，px/s */
  speed?: number;
  /** 两份文本之间的间隔，px */
  gap?: number;
}>(), {
  speed: 40,
  gap: 48,
});

const wrapper = ref<HTMLDivElement | null>(null);
const content = ref<HTMLSpanElement | null>(null);
const overflow = ref(false);
const duration = ref(0);

function measure() {
  const wrap = wrapper.value;
  const c = content.value;
  if (!wrap || !c) return;
  const wrapWidth = wrap.clientWidth;
  if (wrapWidth === 0) return; // 隐藏状态，等下次有宽度再测

  const contentWidth = c.scrollWidth;
  // 1px 容差，避免亚像素误差导致本不该滚的滚动
  overflow.value = contentWidth > wrapWidth + 1;

  if (overflow.value) {
    const distance = contentWidth + props.gap;
    duration.value = Math.max(2, distance / props.speed);
  }
}

let ro: ResizeObserver | null = null;

onMounted(() => {
  measure();
  ro = new ResizeObserver(measure);
  if (wrapper.value) ro.observe(wrapper.value);
  if (content.value) ro.observe(content.value);
});

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
});

watch(() => props.text, () => {
  // 等 DOM 更新后再测
  requestAnimationFrame(measure);
});
</script>

<template>
  <div ref="wrapper" class="marquee" :class="{ 'is-scrolling': overflow }">
    <div
      class="marquee-inner"
      :style="overflow ? { animationDuration: duration + 's', '--gap': gap + 'px' } : undefined"
    >
      <span ref="content" class="marquee-content">{{ text || ' ' }}</span>
      <span v-if="overflow" class="marquee-content" aria-hidden="true">{{ text }}</span>
    </div>
  </div>
</template>