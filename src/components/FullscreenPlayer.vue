
<script setup lang="ts">
import { computed, watch } from 'vue';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconSkipBack from '~icons/lucide/skip-back';
import IconSkipForward from '~icons/lucide/skip-forward';
import IconChevronDown from '~icons/lucide/chevron-down';
import IconVolume2 from '~icons/lucide/volume-2';
import { usePlayer } from '../composables/usePlayer';
import MarqueeText from './MarqueeText.vue';

const {
  currentSong, isPlaying, currentTime, duration, volume, playLevel, playlist, currentIndex,
  toggle, seek, setVolume, playNext, playPrev, isFullscreen, toggleFullscreen,
} = usePlayer();

const song = computed(() => currentSong.value);
const coverUrl = computed(() => song.value?.al?.picUrl || song.value?.album?.picUrl || '');
const artists = computed(() => (song.value?.ar || song.value?.artists || []).map(a => a.name).join(' / '));
const album = computed(() => song.value?.al?.name || song.value?.album?.name || '');
const canPrev = computed(() => currentIndex.value > 0);
const canNext = computed(() => currentIndex.value < playlist.value.length - 1);

const progressPercent = computed(() => {
  if (!duration.value || duration.value <= 0) return '0%';
  return `${(Math.max(0, Math.min(1, currentTime.value / duration.value)) * 100).toFixed(2)}%`;
});
const volumePercent = computed(() => `${(volume.value * 100).toFixed(2)}%`);
watch(isFullscreen, (val) => {
  document.body.style.overflow = val ? 'hidden' : '';
});

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function onSeek(e: Event) { seek(Number((e.target as HTMLInputElement).value)); }
function onVolume(e: Event) { setVolume(Number((e.target as HTMLInputElement).value)); }
function onLevelChange(e: Event) { playLevel.value = (e.target as HTMLSelectElement).value as any; }
</script>

<template>
  <transition name="fullscreen-slide">
    <div v-if="song && isFullscreen" class="fullscreen-player">
      <div class="fs-backdrop" :style="{ backgroundImage: `url(${coverUrl})` }"></div>
      
      <div class="fs-content">
        <header class="fs-header">
          <button class="fs-close" @click="toggleFullscreen">
            <IconChevronDown />
          </button>
          <span class="fs-header-title">正在播放</span>
          <div style="width: 40px;"></div>
        </header>

        <div class="fs-cover-wrap">
          <img v-if="coverUrl" :src="coverUrl" class="fs-cover" alt="" />
          <div v-else class="fs-cover fs-cover--placeholder"></div>
        </div>

        <div class="fs-info">
          <MarqueeText class="fs-title" :text="song.name || '未知歌曲'" :speed="40" />
          <div class="fs-sub">
            <MarqueeText :text="`${artists || '未知艺术家'}${album ? ' · ' + album : ''}`" :speed="30" />
          </div>
        </div>

        <!-- 进度条区域 -->
        <div class="fs-progress">
          <input class="player-range fs-range" type="range" min="0" :max="duration || 0" step="0.1" :value="currentTime" :style="{ '--percent': progressPercent }" @input="onSeek" />
          <div class="fs-time">
            <span>{{ fmt(currentTime) }}</span>
            <span>{{ fmt(duration) }}</span>
          </div>
        </div>

        <!-- 控制按钮区域 -->
        <div class="fs-controls">
          <button class="fs-btn" :disabled="!canPrev" @click="playPrev">
            <IconSkipBack />
          </button>
          <button class="fs-btn fs-btn-main" @click="toggle">
            <IconPause v-if="isPlaying" />
            <IconPlay v-else />
          </button>
          <button class="fs-btn" :disabled="!canNext" @click="playNext">
            <IconSkipForward />
          </button>
        </div>

        <!-- 底部附加控制 -->
        <div class="fs-footer">
          <select class="fs-level-select" :value="playLevel" @change="onLevelChange">
            <option value="standard">标准音质</option>
            <option value="higher">较高音质</option>
            <option value="exhigh">极高音质</option>
            <option value="lossless">无损音质</option>
            <option value="hires">Hi-Res</option>
          </select>
          
          <div class="fs-volume">
            <IconVolume2 />
            <input class="player-range fs-range fs-range-vol" type="range" min="0" max="1" step="0.01" :value="volume" :style="{ '--percent': volumePercent }" @input="onVolume" />
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>