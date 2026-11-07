<script setup lang="ts">
import { computed, ref } from 'vue';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconDownload from '~icons/lucide/download';
import IconClock from '~icons/lucide/clock';
import IconCheck from '~icons/lucide/check';
import IconAlertCircle from '~icons/lucide/alert-circle';
import IconLoader from '~icons/lucide/loader';
import type { QualityLevel, Song, SongUrlData } from '../types';
import { useApi } from '../composables/useApi';
import { useLog } from '../composables/useLog';
import { usePlayer } from '../composables/usePlayer';
import { useDownloadQueue } from '../composables/useDownloadQueue';

const props = defineProps<{
  song: Song;
  urlData?: SongUrlData | null;
  level: QualityLevel;
  selectable?: boolean;
  selected?: boolean;
}>();

const { api } = useApi();
const { log } = useLog();
const { play, isCurrent, isPlaying, currentUrlData } = usePlayer();
const { enqueueOne, cancel, getTask, zipBatch } = useDownloadQueue();

const artists = computed(() =>
  (props.song.ar || props.song.artists || []).map(a => a.name).join(' / ')
);
const album = computed(() => props.song.al?.name || props.song.album?.name || '');
const coverUrl = computed(() =>
  props.song.al?.picUrl || props.song.album?.picUrl || ''
);

const isActiveSong = computed(() => isCurrent(props.song.id));
const isThisPlaying = computed(() => isActiveSong.value && isPlaying.value);
const noUrl = computed(() => Boolean(props.urlData && !props.urlData.url));

/* ---------- 播放 ---------- */
const playLoading = ref(false);

async function fetchSongUrl(): Promise<SongUrlData> {
  const res = await api<any>('/song/url/v1', { id: props.song.id, level: props.level });
  const d = res?.data?.[0];
  if (!d?.url) throw new Error('未获取到可用的播放地址（可能无版权或该音质不可用）');
  return d;
}

async function onPlay() {
  if (isActiveSong.value && currentUrlData.value) {
    await play(props.song, currentUrlData.value);
    return;
  }
  playLoading.value = true;
  try {
    const d = props.urlData?.url ? props.urlData : await fetchSongUrl();
    await play(props.song, d);
  } catch (e) {
    log('error', '播放失败：' + (e as Error).message);
  } finally {
    playLoading.value = false;
  }
}

/* ---------- 下载 ---------- */
const dlTask = computed(() => getTask(props.song.id));
const dlStatus = computed(() => dlTask.value?.status ?? 'idle');
const dlPercent = computed(() => {
  const t = dlTask.value;
  if (!t || t.total <= 0) return null;
  return Math.min(100, Math.round((t.received / t.total) * 100));
});

const R = 15;
const CIRCUMFERENCE = 2 * Math.PI * R;
const dashOffset = computed(() => {
  const p = dlPercent.value;
  if (p === null) return 0;
  return CIRCUMFERENCE * (1 - p / 100);
});

const dlTitle = computed(() => {
  const s = dlStatus.value;
  if (s === 'queued') return '排队中（点击取消）';
  if (s === 'fetching') return dlPercent.value !== null
    ? `下载中 ${dlPercent.value}%（点击取消）`
    : '下载中（点击取消）';
  if (s === 'processing') return '嵌入元数据…（点击取消）';
  if (s === 'saving') return '保存中…';
  if (s === 'done') return '已下载（点击重新下载）';
  if (s === 'error') return `下载失败：${dlTask.value?.error ?? '未知错误'}（点击重试）`;
  if (s === 'canceled') return '已取消（点击重试）';
  return '下载';
});

function onDownloadClick() {
  if (zipBatch.value?.active) return;
  const s = dlStatus.value;
  
  // 正在进行中的状态，点击则取消
  if (s === 'queued' || s === 'fetching' || s === 'processing') {
    cancel(props.song.id);
    return;
  }
  
  // 保存中不允许点击，防止重复保存
  if (s === 'saving') return;

  // idle / done / error / canceled 状态全部允许重新入队
  enqueueOne(props.song, props.level, props.urlData);
}

const emit = defineEmits<{ 'update:selected': [value: boolean] }>();
</script>

<template>
  <div class="song-row" :class="{ active: isActiveSong }">
    <div v-if="selectable" class="song-check">
    <input
        type="checkbox"
        :checked="selected"
        @change="emit('update:selected', ($event.target as HTMLInputElement).checked)"
      />
    </div>
    <div class="song-cover-wrap">
      <img v-if="coverUrl" :src="coverUrl" class="song-cover" alt="" loading="lazy" />
      <div v-else class="song-cover song-cover--placeholder"></div>
      <button
        type="button"
        class="song-cover-play"
        :disabled="noUrl || playLoading"
        :title="isThisPlaying ? '暂停' : '播放'"
        @click="onPlay"
      >
        <IconPause v-if="isThisPlaying" />
        <IconPlay v-else />
      </button>
    </div>

    <div class="song-main">
      <div class="song-name" :title="song.name || '未知歌曲'">
        {{ song.name || '未知歌曲' }}
      </div>
      <div
        v-if="artists || album"
        class="song-sub muted small"
        :title="artists + (album ? ' · ' + album : '')"
      >
        {{ artists }}<template v-if="album"> · {{ album }}</template>
      </div>
    </div>

    <div class="song-actions">
      <button
        type="button"
        class="icon-btn"
        :disabled="dlStatus === 'saving' || zipBatch?.active"
        :title="isThisPlaying ? '暂停' : '试听'"
        @click="onPlay"
      >
        <IconLoader v-if="playLoading" class="spin" />
        <IconPause v-else-if="isThisPlaying" />
        <IconPlay v-else />
      </button>

      <button
        type="button"
        class="icon-btn dl-btn"
        :class="{
          'is-done': dlStatus === 'done',
          'is-error': dlStatus === 'error' || dlStatus === 'canceled',
          'is-active': dlStatus === 'queued' || dlStatus === 'fetching'
            || dlStatus === 'processing' || dlStatus === 'saving',
        }"
        :disabled="dlStatus === 'saving'"
        :title="dlTitle"
        @click="onDownloadClick"
      >
        <!-- done -->
        <IconCheck v-if="dlStatus === 'done'" />
        <!-- error / canceled -->
        <IconAlertCircle v-else-if="dlStatus === 'error' || dlStatus === 'canceled'" />
        <!-- queued -->
        <IconClock v-else-if="dlStatus === 'queued'" />
        <!-- fetching / processing / saving -->
        <template v-else-if="dlStatus === 'fetching' || dlStatus === 'processing' || dlStatus === 'saving'">
          <svg class="progress-ring" viewBox="0 0 36 36">
            <circle class="progress-ring-bg" cx="18" cy="18" :r="R" />
            <circle
              v-if="dlPercent !== null"
              class="progress-ring-fill"
              cx="18" cy="18" :r="R"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="dashOffset"
            />
          </svg>
          <span v-if="dlPercent !== null" class="dl-pct">{{ dlPercent }}</span>
          <IconLoader v-else class="spin progress-spin" />
        </template>
        <!-- idle -->
        <IconDownload v-else />
      </button>
    </div>
  </div>
</template>