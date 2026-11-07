<script setup lang="ts">
import { computed, ref } from 'vue';
import type { QualityLevel, Song, SongUrlData } from '../types';
import SongRow from '../components/SongRow.vue';
import { useApi } from '../composables/useApi';
import { useLog } from '../composables/useLog';
import { usePlayer } from '../composables/usePlayer';
import { useDownloadQueue, type DownloadTaskState } from '../composables/useDownloadQueue';
import { extractUrl, parseInput } from '../utils/parse';
import { safeFilename } from '../utils/download';
import { forceHttps } from '../utils/url.ts';
import { resolveShortLink } from '../utils/resolveShortLink';

const { api } = useApi();
const { log } = useLog();
const { reset } = usePlayer();

const {
  enqueueBatch, cancelBatch,
  zipBatch, activeTasks, activeQueuePercent, batchPercent, isAnyActive,
} = useDownloadQueue();

const parseValue = ref('');
const level = ref<QualityLevel>('exhigh');

type ResultState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'error'; error: string }
  | { kind: 'song'; song: Song; urlData: SongUrlData | null }
  | {
    kind: 'list';
    title: string;
    count: number; // 总数量
    items: Array<{ song: Song; urlData: SongUrlData | null }>;
    pendingIds?: number[]; // 还没拉取详情的 ID
    fallbackTracks?: Song[]; // 还没拉取的备用数据
  };

const state = ref<ResultState>({ kind: 'empty' });

const history = ref<ResultState[]>([]);

function goBack() {
  const prev = history.value.pop();
  if (prev) {
    state.value = prev;
    selectedIds.value = new Set(); // 回退时清空勾选
    parseValue.value = ''; // 清空输入框，防止混淆
  }
}

function parseAlbum(id: number) {
  parseValue.value = "https://music.163.com/#/album?id="+String(id);
  handleParse();
}

/* ---------- 选择 ---------- */

const selectedIds = ref<Set<number>>(new Set());

function toggleSelect(id: number, selected: boolean) {
  const s = new Set(selectedIds.value);
  if (selected) s.add(id); else s.delete(id);
  selectedIds.value = s;
}

const allSelected = computed(() => {
  if (state.value.kind !== 'list' || state.value.items.length === 0) return false;
  return state.value.items.every(i => selectedIds.value.has(i.song.id));
});

const selectedCount = computed(() => {
  if (state.value.kind !== 'list') return 0;
  return state.value.items.filter(i => selectedIds.value.has(i.song.id)).length;
});

function toggleSelectAll() {
  if (state.value.kind !== 'list') return;
  selectedIds.value = allSelected.value
    ? new Set()
    : new Set(state.value.items.map(i => i.song.id));
}

function downloadSelected() {
  if (state.value.kind !== 'list') return;
  const selected = state.value.items.filter(i => selectedIds.value.has(i.song.id));
  if (selected.length === 0) return;

  const base = state.value.title.replace(/^(歌单|专辑)：/, '');
  const zipName = safeFilename(base) + '.zip';
  try {
    enqueueBatch(selected, level.value, zipName);
  } catch (e) {
    log('error', (e as Error).message);
  }
}

/* ---------- 批量获取歌曲详情 ---------- */

const DETAIL_BATCH_SIZE = 1000;

async function fetchFullSongs(ids: number[]): Promise<Song[]> {
  if (ids.length === 0) return [];
  const total = ids.length;
  const batches = Math.ceil(total / DETAIL_BATCH_SIZE);
  log('info', `批量获取歌曲详情：${total} 首，分 ${batches} 批`);

  const out: Song[] = [];
  for (let i = 0; i < total; i += DETAIL_BATCH_SIZE) {
    const chunk = ids.slice(i, i + DETAIL_BATCH_SIZE);
    try {
      const res = await api<any>('/song/detail', { ids: chunk.join(',') });
      const songs: Song[] = res?.songs || [];
      out.push(...songs);
      log('info', `歌曲详情进度：${Math.min(i + DETAIL_BATCH_SIZE, total)}/${total}`);
    } catch (e) {
      log('warn', `获取歌曲详情失败（第 ${Math.floor(i / DETAIL_BATCH_SIZE) + 1} 批）：${(e as Error).message}`);
    }
  }
  return out;
}

/** 按请求顺序还原，详情缺失时回退到 fallback */
function mergeByIds(ids: number[], detailSongs: Song[], fallback: Song[]): Song[] {
  const detailMap = new Map<number, Song>();
  for (const s of detailSongs) detailMap.set(s.id, s);
  const fallbackMap = new Map<number, Song>();
  for (const s of fallback) fallbackMap.set(s.id, s);

  const result: Song[] = [];
  let missing = 0;
  for (const id of ids) {
    const d = detailMap.get(id);
    if (d) {
      result.push(d);
    } else {
      const fb = fallbackMap.get(id);
      if (fb) result.push(fb);
      else missing++;
    }
  }
  if (missing > 0) log('warn', `${missing} 首歌曲详情缺失，已跳过`);
  return result;
}

/* ---------- 主流程 ---------- */

const loadingMore = ref(false);

async function loadAllTracks() {
  if (state.value.kind !== 'list' || !state.value.pendingIds || state.value.pendingIds.length === 0) return;

  loadingMore.value = true;
  try {
    const idsToLoad = state.value.pendingIds;
    const detailSongs = await fetchFullSongs(idsToLoad);
    const newSongs = mergeByIds(idsToLoad, detailSongs, state.value.fallbackTracks || []);

    // 追加到列表中，并清空 pending 状态
    state.value = {
      ...state.value,
      items: [...state.value.items, ...newSongs.map(s => ({ song: s, urlData: null }))],
      pendingIds: undefined,
      fallbackTracks: undefined,
    };
    log('info', `已加载全部歌曲详情，共 ${state.value.items.length} 首`);
  } catch (e) {
    log('error', '加载剩余歌曲失败：' + (e as Error).message);
  } finally {
    loadingMore.value = false;
  }
}

/* ---------- 搜索单曲 ---------- */


async function handleSearch(keywords: string) {
  try {
    log('info', `搜索关键词：${keywords}`);
    // type=1 搜索单曲，limit=50
    const res = await api<any>('/search', { keywords, type: 1, limit: 50 });
    const rawSongs = res?.result?.songs || [];

    if (rawSongs.length === 0) {
      state.value = {
        kind: 'list',
        title: `搜索："${keywords}"`,
        count: 0,
        items: []
      };
      log('info', '未找到相关歌曲');
      return;
    }

    // 1. 从搜索结果提取歌曲 ID
    const ids = rawSongs.map((s: any) => s.id);

    // 2. 批量拉取完整详情（此时能拿到封面 picUrl、准确时长 dt 等）
    const detailSongs = await fetchFullSongs(ids);

    // 3. 按原搜索顺序还原
    const songs = mergeByIds(ids, detailSongs, []);

    state.value = {
      kind: 'list',
      title: `搜索："${keywords}"`,
      count: songs.length,
      items: songs.map(s => ({ song: s, urlData: null })),
    };
    log('info', `搜索完成，找到 ${songs.length} 首歌曲`);
  } catch (e) {
    const msg = (e as Error).message;
    state.value = { kind: 'error', error: msg };
    log('error', '搜索失败：' + msg);
  }
}
/* ---------- 主流程 ---------- */

async function handleParse() {
  let raw = parseValue.value.trim();
  if (!raw) { state.value = { kind: 'empty' }; return; }

  // 1. 压入历史栈（如果当前已经是有效结果）
  if (state.value.kind === 'list' || state.value.kind === 'song') {
    // 防止压入连续的相同状态
    history.value.push(state.value);
    if (history.value.length > 20) history.value.shift(); // 限制栈深度防内存泄漏
  }

  reset();
  selectedIds.value = new Set();
  state.value = { kind: 'loading' };

  try {
    // 1. 从一堆分享文案中提取真实的 URL
    raw = extractUrl(raw);

    // 2. 短链接还原
    raw = await resolveShortLink(raw);

    // 3. 尝试提取 ID / 链接
    let info;
    try {
      info = parseInput(raw);
    } catch (e) {
      if ((e as Error).message === 'NOT_A_LINK') {
        // 不是链接，直接走搜索流程
        await handleSearch(raw);
        return;
      }
      throw e;
    }

    if (info.type === 'song') {
      const [detail, urlRes] = await Promise.all([
        api<any>('/song/detail', { ids: info.id }),
        api<any>('/song/url/v1', { id: info.id, level: level.value }),
      ]);
      const song = detail?.songs?.[0];
      const songUrlData = urlRes?.data?.[0];
      if (songUrlData?.url) {
        songUrlData.url = forceHttps(songUrlData.url);
      }
      if (!song) throw new Error('未找到该歌曲');
      state.value = { kind: 'song', song, urlData: songUrlData ?? null };
      log('info', `解析歌曲：${song.name}`);
      return;
    }

    if (info.type === 'playlist') {
      const res = await api<any>('/playlist/detail', { id: info.id });
      const pl = res?.playlist;
      if (!pl) throw new Error('未找到该歌单');

      const trackIds: number[] = Array.isArray(pl.trackIds) && pl.trackIds.length > 0
        ? pl.trackIds.map((t: any) => t?.id).filter((id: unknown): id is number => typeof id === 'number')
        : (pl.tracks || []).map((s: Song) => s.id);
      const fallbackTracks: Song[] = pl.tracks || [];

      // 拆分首批和剩余
      const initialIds = trackIds.slice(0, DETAIL_BATCH_SIZE);
      const pendingIds = trackIds.slice(DETAIL_BATCH_SIZE);

      const detailSongs = await fetchFullSongs(initialIds);
      const songs = mergeByIds(initialIds, detailSongs, fallbackTracks);

      state.value = {
        kind: 'list',
        title: `歌单：${pl.name}`,
        count: trackIds.length,
        items: songs.map(s => ({ song: s, urlData: null })),
        pendingIds: pendingIds.length > 0 ? pendingIds : undefined,
        fallbackTracks: pendingIds.length > 0 ? fallbackTracks : undefined,
      };
      log('info', `解析歌单：${pl.name}（已加载 ${songs.length}/${trackIds.length} 首）`);
      return;
    }

    if (info.type === 'album') {
      const res = await api<any>('/album', { id: info.id });
      const album = res?.album;
      if (!album) throw new Error('未找到该专辑');

      const fallbackSongs: Song[] = res?.songs || [];
      const ids = fallbackSongs.map(s => s.id);

      const detailSongs = await fetchFullSongs(ids);
      const songs = mergeByIds(ids, detailSongs, fallbackSongs);

      state.value = {
        kind: 'list',
        title: `专辑：${album.name}`,
        count: songs.length,
        items: songs.map(s => ({ song: s, urlData: null })),
      };
      log('info', `解析专辑：${album.name}（${songs.length} 首）`);
    }
  } catch (e) {
    const msg = (e as Error).message;
    state.value = { kind: 'error', error: msg };
    log('error', '解析失败：' + msg);
  }
}

</script>

<template>
  <fieldset>
    <legend>解析</legend>
    <div class="row">
      <input v-model="parseValue" type="text" placeholder="粘贴歌曲 / 歌单链接，或纯数字 ID" style="flex:1;min-width:200px"
        @keydown.enter="handleParse" />
      <button type="button" @click="handleParse">解析</button>
    </div>
    <div class="row" style="margin-top:8px">
      <label for="level" class="small muted">音质：</label>
      <select id="level" v-model="level">
        <option value="standard">标准</option>
        <option value="higher">较高</option>
        <option value="exhigh">极高</option>
        <option value="lossless">无损</option>
        <option value="hires">Hi-Res</option>
        <option value="jyeffect">沉浸环绕声</option>
        <option value="sky">沉浸环绕声（Sky）</option>
      </select>
    </div>
  </fieldset>

  <fieldset>
    <legend>结果</legend>
    <div v-if="history.length > 0" class="history-back">
      <button type="button" class="ghost small-btn" @click="goBack">
        ← 返回上一步
      </button>
    </div>
    <div v-if="state.kind === 'empty'" class="empty">暂无结果，先在上面解析一个链接吧。</div>
    <div v-else-if="state.kind === 'loading'" class="empty">解析中…</div>
    <div v-else-if="state.kind === 'error'" class="empty" style="color:var(--err)">
      解析失败：{{ state.error }}
    </div>
    <SongRow v-else-if="state.kind === 'song'" :song="state.song" :url-data="state.urlData" :level="level" />
    <template v-else>
      <div class="result-title">
        <span class="result-title-name" :title="state.title">{{ state.title }}</span>
        <span class="result-title-count muted small">
          · 共 {{ state.count }} 首
          <template v-if="state.pendingIds && state.pendingIds.length > 0">
            （当前展示 {{ state.items.length }} 首）
          </template>
        </span>
      </div>

      <div class="batch-toolbar">
        <label class="batch-select-all">
          <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
          <span class="small">全选</span>
        </label>
        <span class="small muted">已选 {{ selectedCount }} 首</span>
        <button type="button" :disabled="selectedCount === 0 || isAnyActive" @click="downloadSelected">打包下载</button>
        <button v-if="zipBatch?.active" type="button" class="ghost" @click="cancelBatch">取消</button>
      </div>

      <div v-if="zipBatch" class="batch-progress-wrap">

        <!-- 打包状态提示 -->
        <div class="batch-progress-row" v-if="zipBatch.packing">
          <span class="batch-progress-label small muted">状态</span>
          <span class="batch-progress-name small" style="color: var(--brand); flex: 1;">
            正在打包 ZIP（成功 {{ zipBatch.done }} 首，失败 {{ zipBatch.failed }} 首），请稍候…
          </span>
          <IconLoader class="spin" style="color: var(--brand);" />
        </div>

        <!-- 第一条：当前并发下载队列进度 -->
        <div class="batch-progress-row" v-else-if="activeTasks.length > 0">
          <span class="batch-progress-label small muted">当前</span>
          <span class="batch-progress-name small" :title="activeTasks.map(t => t.songName).join(' / ')">
            {{activeTasks.map((t: DownloadTaskState) => t.songName).join(' / ')}}
          </span>
          <div class="batch-progress-bar">
            <div class="batch-progress-inner" :style="{ width: activeQueuePercent + '%' }"></div>
          </div>
          <span class="batch-progress-pct small">{{ activeQueuePercent }}%</span>
        </div>

        <!-- 第二条：总计进度 -->
        <div class="batch-progress-row" v-if="!zipBatch.packing">
          <span class="batch-progress-label small muted">总计</span>
          <span class="batch-progress-name small">
            {{ zipBatch.done + zipBatch.failed }}/{{ zipBatch.total }} 首
            <template v-if="zipBatch.failed > 0"> · <span class="err">{{ zipBatch.failed }} 失败</span></template>
          </span>
          <div class="batch-progress-bar">
            <div class="batch-progress-inner" :style="{ width: batchPercent + '%' }"></div>
          </div>
          <span class="batch-progress-pct small">{{ batchPercent }}%</span>
        </div>

      </div>

      <SongRow
        v-for="item in state.items"
        :key="item.song.id"
        :song="item.song"
        :url-data="item.urlData"
        :level="level"
        :selectable="true"
        :selected="selectedIds.has(item.song.id)"
        @update:selected="(v) => toggleSelect(item.song.id, v)"
        @click-album="parseAlbum"
      />

      <!-- 新增：加载剩余 -->
      <div v-if="state.pendingIds && state.pendingIds.length > 0" class="load-more-wrap">
        <button type="button" class="ghost" :disabled="loadingMore" @click="loadAllTracks">
          <IconLoader v-if="loadingMore" class="spin" style="margin-right: 6px;" />
          {{ loadingMore ? `正在加载剩余 ${state.pendingIds.length} 首…` : `加载剩余 ${state.pendingIds.length} 首` }}
        </button>
      </div>

    </template>
  </fieldset>
</template>
