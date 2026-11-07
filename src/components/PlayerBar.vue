<script setup lang="ts">
import { computed } from 'vue';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconVolume2 from '~icons/lucide/volume-2';
import { usePlayer } from '../composables/usePlayer';
import MarqueeText from './MarqueeText.vue';

const {
  currentSong, isPlaying, currentTime, duration, volume,
  toggle, seek, setVolume,
} = usePlayer();

const song = computed(() => currentSong.value);
const coverUrl = computed(() =>
  song.value?.al?.picUrl || song.value?.album?.picUrl || ''
);
const artists = computed(() =>
  (song.value?.ar || song.value?.artists || []).map(a => a.name).join(' / ')
);
const album = computed(() => song.value?.al?.name || song.value?.album?.name || '');

const progressPercent = computed(() => {
  if (!duration.value || duration.value <= 0) return '0%';
  const p = Math.max(0, Math.min(1, currentTime.value / duration.value));
  return `${(p * 100).toFixed(2)}%`;
});

const volumePercent = computed(() => `${(volume.value * 100).toFixed(2)}%`);

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function onSeek(e: Event) {
  seek(Number((e.target as HTMLInputElement).value));
}
function onVolume(e: Event) {
  setVolume(Number((e.target as HTMLInputElement).value));
}
</script>

<template>
  <transition name="player-slide">
    <div v-if="song" class="player-bar">
      <div class="player-info">
        <img v-if="coverUrl" :src="coverUrl" class="player-cover" alt="" />
        <div v-else class="player-cover player-cover--placeholder"></div>
        <div class="player-meta">
          <MarqueeText class="player-title" :text="song.name || '未知歌曲'" :speed="40" />
          <MarqueeText class="player-sub" :text="`${artists || '未知艺术家'}${album ? ' · ' + album : ''}`" :speed="30" />
        </div>
      </div>

      <div class="player-controls">
        <button type="button" class="player-toggle" @click="toggle">
          <IconPause v-if="isPlaying" />
          <IconPlay v-else />
        </button>
        <span class="player-time">{{ fmt(currentTime) }}</span>
        <input class="player-range" type="range" min="0" :max="duration || 0" step="0.1" :value="currentTime"
          :style="{ '--percent': progressPercent }" @input="onSeek" />
        <span class="player-time">{{ fmt(duration) }}</span>
      </div>

      <div class="player-volume">
        <IconVolume2 />
        <input class="player-range player-range--volume" type="range" min="0" max="1" step="0.01" :value="volume"
          :style="{ '--percent': volumePercent }" @input="onVolume" />
      </div>
    </div>
  </transition>
</template>