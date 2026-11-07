import { computed, reactive, ref } from "vue";
import JSZip from "jszip";
import type { QualityLevel, Song, SongUrlData } from "../types";
import { useApi } from "./useApi";
import { useLog } from "./useLog";
import { fetchWithProgress, safeFilename, saveBlob } from "../utils/download";
import { forceHttps } from "../utils/url";
import { getOptimizedCoverUrl } from "../utils/cover"; // 导入工具函数
import { embedMetadata } from "../utils/tagWriter";

export type DownloadStatus =
  | "idle"
  | "queued"
  | "fetching"
  | "processing"
  | "saving"
  | "done"
  | "error"
  | "canceled";

export interface DownloadTaskState {
  status: DownloadStatus;
  received: number;
  total: number;
  error?: string;
  songName: string;
  artistName: string;
}

interface TaskInput {
  song: Song;
  level: QualityLevel;
  urlData?: SongUrlData | null;
}

interface ZipBatch {
  name: string;
  ids: Set<number>;
  total: number;
  done: number;
  failed: number;
  totalBytes: number;
  buffers: Map<number, { blob: Blob; filename: string }>;
  active: boolean;
}

const DEFAULT_CONCURRENCY = 2;
const ZIP_CONCURRENCY = 1;
const MAX_ZIP_SONGS = 1000; // 设一个极大的数字，相当于不限制
const MAX_ZIP_BYTES = 1024 * 1024 * 1024; // 1 GB

const tasks = reactive(new Map<number, DownloadTaskState>());
const controllers = new Map<number, AbortController>();
const pending = new Map<number, TaskInput>();
const queue: number[] = [];
let running = 0;
let concurrency = DEFAULT_CONCURRENCY;

const zipBatch = ref<ZipBatch | null>(null);

const ACTIVE_STATUSES: DownloadStatus[] = [
  "queued",
  "fetching",
  "processing",
  "saving",
];
function isActive(s?: DownloadStatus) {
  return !!s && ACTIVE_STATUSES.includes(s);
}

export function useDownloadQueue() {
  const { api } = useApi();
  const { log } = useLog();

  function getTask(id: number) {
    return tasks.get(id);
  }

  function enqueueOne(
    song: Song,
    level: QualityLevel,
    urlData?: SongUrlData | null,
  ) {
    if (zipBatch.value?.active) return;
    const existing = tasks.get(song.id);
    if (existing && (isActive(existing.status))) return;

    const artists = (song.ar || song.artists || []).map((a) => a.name).join(
      " / ",
    );
    tasks.set(song.id, {
      status: "queued",
      received: 0,
      total: 0,
      songName: song.name,
      artistName: artists,
    });
    pending.set(song.id, { song, level, urlData });
    queue.push(song.id);
    concurrency = DEFAULT_CONCURRENCY;
    pump();
  }

  function enqueueBatch(
    items: Array<{ song: Song; urlData?: SongUrlData | null }>,
    level: QualityLevel,
    zipName: string,
  ) {
    if (zipBatch.value?.active) throw new Error("已有批量下载进行中");
    if (items.length === 0) throw new Error("未选择任何歌曲");
    if (items.length > MAX_ZIP_SONGS) {
      throw new Error(`单次批量下载最多 ${MAX_ZIP_SONGS} 首`);
    }

    // 用 dt 粗估大小（128 kbps 保守估算）
    const estimated = items.reduce(
      (sum, i) => sum + ((i.song.dt ?? 0) / 1000) * 128_000 / 8,
      0,
    );
    if (estimated > MAX_ZIP_BYTES) {
      throw new Error(
        `预估约 ${(estimated / 1024 / 1024).toFixed(0)}MB，超过 ` +
          `${MAX_ZIP_BYTES / 1024 / 1024}MB 上限，请减少曲目`,
      );
    }

    zipBatch.value = {
      name: zipName,
      ids: new Set(items.map((i) => i.song.id)),
      total: items.length,
      done: 0,
      failed: 0,
      totalBytes: 0,
      buffers: new Map(),
      active: true,
    };
    concurrency = ZIP_CONCURRENCY;

    for (const item of items) {
      const artists = (item.song.ar || item.song.artists || []).map((a) =>
        a.name
      ).join(" / ");
      tasks.set(item.song.id, {
        status: "queued",
        received: 0,
        total: 0,
        songName: item.song.name,
        artistName: artists,
      });
      pending.set(item.song.id, {
        song: item.song,
        level,
        urlData: item.urlData,
      });
      queue.push(item.song.id);
    }

    log("info", `批量下载开始：${items.length} 首 → ${zipName}`);
    pump();
  }

  function cancel(id: number) {
    controllers.get(id)?.abort();
    controllers.delete(id);
    const qi = queue.indexOf(id);
    if (qi >= 0) queue.splice(qi, 1);
    const t = tasks.get(id);
    if (t && isActive(t.status)) t.status = "canceled";
  }

  function cancelBatch() {
    const b = zipBatch.value;
    if (!b || !b.active) return;
    b.active = false;
    for (const id of b.ids) {
      const t = tasks.get(id);
      if (t && isActive(t.status)) cancel(id);
    }
    b.buffers.clear();
    zipBatch.value = null;
    log("info", "已取消批量下载");
  }

  function clear(ids?: number[]) {
    const list = ids ?? Array.from(tasks.keys());
    for (const id of list) {
      const t = tasks.get(id);
      if (t && isActive(t.status)) cancel(id);
      tasks.delete(id);
      pending.delete(id);
    }
  }

  async function pump() {
    while (running < concurrency && queue.length > 0) {
      const id = queue.shift()!;
      const info = pending.get(id);
      if (!info) continue;
      const t = tasks.get(id);
      if (!t || t.status === "canceled") continue;
      running++;
      runOne(id, info).finally(() => {
        running--;
        pump();
      });
    }
  }

  async function runOne(id: number, info: TaskInput) {
    const t = tasks.get(id)!;
    const { song, level, urlData } = info;
    const ctrl = new AbortController();
    controllers.set(id, ctrl);

    const batch = zipBatch.value;
    const inZipBatch = !!(batch && batch.active && batch.ids.has(id));

    try {
      t.status = "fetching";
      t.received = 0;
      t.total = 0;

      let d: SongUrlData | null = urlData?.url ? urlData : null;
      if (!d) {
        const res = await api<any>("/song/url/v1", { id: song.id, level });
        d = res?.data?.[0] ?? null;
      }
      if (!d?.url) throw new Error("无可用播放地址");

      const { buffer, contentType } = await fetchWithProgress(
        forceHttps(d.url),
        {
          signal: ctrl.signal,
          onProgress: (p) => {
            t.received = p.received;
            t.total = p.total;
          },
        },
      );

      t.status = "processing";
      const artists = (song.ar || song.artists || []).map((a) => a.name).join(
        " / ",
      );
      const albumName = song.al?.name || song.album?.name || "";
      const coverUrl = getOptimizedCoverUrl(
        song.al?.picUrl || song.album?.picUrl,
      );

      let bytes: Uint8Array<ArrayBuffer> | ArrayBuffer = buffer;
      try {
        bytes = await embedMetadata(buffer, {
          title: song.name,
          artist: artists,
          album: albumName,
          coverUrl,
        });
      } catch (e) {
        log("warn", `元数据写入失败，保留原始音频：${(e as Error).message}`);
      }

      const ext = (d.type || "mp3").toLowerCase();
      const filename = safeFilename(`${artists} - ${song.name}`) + "." + ext;
      const MIME_BY_EXT: Record<string, string> = {
        mp3: "audio/mpeg",
        flac: "audio/flac",
        m4a: "audio/mp4",
        ogg: "audio/ogg",
      };
      const mime = MIME_BY_EXT[ext] || contentType ||
        "application/octet-stream";
      const blob = new Blob([bytes as BlobPart], { type: mime });

      if (inZipBatch && batch) {
        batch.buffers.set(id, { blob, filename });
        batch.done++;
        batch.totalBytes += blob.size;
        log("info", `已下载 ${batch.done}/${batch.total}：${song.name}`);

        if (batch.totalBytes > MAX_ZIP_BYTES) {
          log(
            "warn",
            `累计 ${
              (batch.totalBytes / 1024 / 1024).toFixed(0)
            }MB，超过上限，终止`,
          );
          batch.active = false;
          for (const otherId of batch.ids) {
            const ot = tasks.get(otherId);
            if (ot && isActive(ot.status)) cancel(otherId);
          }
          batch.buffers.clear();
          zipBatch.value = null;
        }
      } else {
        t.status = "saving";
        saveBlob(blob, filename);
        log("info", `下载完成：${song.name}`);
      }

      t.status = "done";
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        t.status = "canceled";
      } else {
        t.status = "error";
        t.error = err.message;
        log("error", `下载失败：${song.name}：${err.message}`);
      }
      if (inZipBatch && batch) batch.failed++;
    } finally {
      controllers.delete(id);
    }

    if (inZipBatch && batch) await maybeFinishBatch(batch);
  }

  async function maybeFinishBatch(batch: ZipBatch) {
    if (!batch.active) return;
    if (batch.done + batch.failed < batch.total) return;

    batch.active = false;

    if (batch.done === 0) {
      log("warn", "批量下载无成功项，跳过打包");
      batch.buffers.clear();
      zipBatch.value = null;
      return;
    }

    log(
      "info",
      `全部曲目就绪（成功 ${batch.done}，失败 ${batch.failed}），开始打包 ZIP`,
    );
    try {
      const zip = new JSZip();
      for (const [, { blob, filename }] of batch.buffers) {
        zip.file(filename, blob);
      }
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
      });
      saveBlob(zipBlob, batch.name);
      log(
        "info",
        `打包完成：${batch.name}（${
          (zipBlob.size / 1024 / 1024).toFixed(1)
        }MB）`,
      );
    } catch (e) {
      log("error", "打包失败：" + (e as Error).message);
    } finally {
      batch.buffers.clear();
      zipBatch.value = null;
    }
  }

  /** 第一条进度条用：当前正在下哪首 */
  const currentDownloading = computed(() => {
    const b = zipBatch.value;
    if (!b || !b.active) return null;
    for (const id of b.ids) {
      const t = tasks.get(id);
      if (
        t &&
        (t.status === "fetching" || t.status === "processing" ||
          t.status === "saving")
      ) {
        return { id, ...t };
      }
    }
    return null;
  });

  const currentPercent = computed(() => {
    const t = currentDownloading.value;
    if (!t || t.total <= 0) return null;
    return Math.min(100, Math.round((t.received / t.total) * 100));
  });

  const batchPercent = computed(() => {
    const b = zipBatch.value;
    if (!b || b.total === 0) return 0;
    return Math.round(((b.done + b.failed) / b.total) * 100);
  });

  const isAnyActive = computed(() => {
    if (zipBatch.value?.active) return true;
    for (const t of tasks.values()) if (isActive(t.status)) return true;
    return false;
  });

  return {
    tasks,
    getTask,
    enqueueOne,
    enqueueBatch,
    cancel,
    cancelBatch,
    clear,
    zipBatch,
    currentDownloading,
    currentPercent,
    batchPercent,
    isAnyActive,
  };
}
