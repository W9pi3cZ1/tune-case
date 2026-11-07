<script setup lang="ts">
import { computed } from 'vue';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconVolume2 from '~icons/lucide/volume-2';
import IconSkipBack from '~icons/lucide/skip-back';
import IconSkipForward from '~icons/lucide/skip-forward';
import IconChevronUp from '~icons/lucide/chevron-up';
import { usePlayer } from '../composables/usePlayer';

import MarqueeText from './MarqueeText.vue';

const {
  currentSong, isPlaying, currentTime, duration, volume, playLevel, playlist, currentIndex,
  toggle, seek, setVolume, playNext, playPrev, toggleFullscreen,
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

const canPrev = computed(() => currentIndex.value > 0);
const canNext = computed(() => currentIndex.value < playlist.value.length - 1);

function onLevelChange(e: Event) {
  playLevel.value = (e.target as HTMLSelectElement).value as any;
}
</script>

<template>
  <transition name="player-slide">
    <div v-if="song" class="player-bar">
      <!-- 点击信息区展开全屏 -->
      <div class="player-info" @click="toggleFullscreen">
        <img v-if="coverUrl" :src="coverUrl" class="player-cover" alt="" />
        <div v-else class="player-cover player-cover--placeholder"></div>
        <div class="player-meta">
          <MarqueeText class="player-title" :text="song.name || '未知歌曲'" :speed="40" />
          <MarqueeText class="player-sub" :text="`${artists || '未知艺术家'}${album ? ' · ' + album : ''}`" :speed="30" />
        </div>
      </div>

      <!-- 控制区域 -->
      <div class="player-controls">
        <!-- 移动端隐藏上一首/下一首，收拢在展开后 -->
        <button class="player-icon-btn hide-on-mobile" :disabled="!canPrev" @click="playPrev" title="上一首">
          <IconSkipBack />
        </button>
        <button type="button" class="player-toggle" @click="toggle">
          <IconPause v-if="isPlaying" />
          <IconPlay v-else />
        </button>
        <button class="player-icon-btn hide-on-mobile" :disabled="!canNext" @click="playNext" title="下一首">
          <IconSkipForward />
        </button>
        
        <span class="player-time hide-on-mobile" style="margin-left: 8px">{{ fmt(currentTime) }}</span>
        <input class="player-range hide-on-mobile" type="range" min="0" :max="duration || 0" step="0.1" :value="currentTime" :style="{ '--percent': progressPercent }" @input="onSeek" />
        <span class="player-time hide-on-mobile">{{ fmt(duration) }}</span>
      </div>

      <div class="player-volume hide-on-mobile">
        <select class="player-level-select small" :value="playLevel" @change="onLevelChange">
          <option value="standard">标准</option>
          <option value="higher">较高</option>
          <option value="exhigh">极高</option>
          <option value="lossless">无损</option>
          <option value="hires">Hi-Res</option>
        </select>
        
        <IconVolume2 style="margin-left: 8px" />
        <input class="player-range player-range--volume" type="range" min="0" max="1" step="0.01" :value="volume" :style="{ '--percent': volumePercent }" @input="onVolume" />
      </div>
      
      <!-- 移动端显式展示展开按钮 -->
      <button class="player-icon-btn show-on-mobile" @click="toggleFullscreen" title="展开播放器">
        <IconChevronUp />
      </button>
    </div>
  </transition>
</template>
