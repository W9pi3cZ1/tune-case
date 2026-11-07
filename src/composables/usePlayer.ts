import { computed, ref } from "vue";
import type { QualityLevel, Song, SongUrlData } from "../types";
import { useApi } from "./useApi";
import { useLog } from "./useLog";
import { forceHttps } from "../utils/url";

const audio = ref<HTMLAudioElement | null>(null);
const playlist = ref<Song[]>([]);
const currentIndex = ref(-1);
const currentUrlData = ref<SongUrlData | null>(null);
const isPlaying = ref(false);
const isFullscreen = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(1);
const playLoading = ref(false);
const playLevel = ref<QualityLevel>("exhigh"); // 播放器专属音质

export function usePlayer() {
  const { api } = useApi();
  const { log } = useLog();

  const currentSong = computed(() => {
    if (currentIndex.value >= 0 && currentIndex.value < playlist.value.length) {
      return playlist.value[currentIndex.value];
    }
    return null;
  });

  const isCurrent = (id: number) => currentSong.value?.id === id;

  async function fetchPlayUrl(song: Song): Promise<SongUrlData> {
    const res = await api<any>("/song/url/v1", {
      id: song.id,
      level: playLevel.value,
    });
    const d = res?.data?.[0];
    if (!d?.url) throw new Error("未获取到可用的播放地址");
    return d;
  }

  async function playSongAt(index: number) {
    const el = audio.value;
    if (!el || index < 0 || index >= playlist.value.length) return;

    currentIndex.value = index;
    const song = playlist.value[index];

    playLoading.value = true;
    try {
      const d = await fetchPlayUrl(song);
      currentUrlData.value = d;
      el.src = forceHttps(d.url!);
      currentTime.value = 0;
      duration.value = (song.dt ?? d.time ?? 0) / 1000;
      await el.play();
    } catch (e) {
      log("error", `播放失败 (${song.name})：` + (e as Error).message);
      isPlaying.value = false;
    } finally {
      playLoading.value = false;
    }
  }

  async function play(song: Song, urlData?: SongUrlData | null) {
    const el = audio.value;
    if (!el) return;

    const existIndex = playlist.value.findIndex((s) => s.id === song.id);
    if (existIndex >= 0) {
      if (currentIndex.value === existIndex) {
        if (el.paused) await el.play();
        else el.pause();
        return;
      }
      if (urlData?.url) {
        currentIndex.value = existIndex;
        currentUrlData.value = urlData;
        el.src = forceHttps(urlData.url);
        currentTime.value = 0;
        duration.value = (song.dt ?? urlData.time ?? 0) / 1000;
        try {
          await el.play();
        } catch {}
      } else {
        await playSongAt(existIndex);
      }
      return;
    }

    playlist.value = [song];
    currentIndex.value = 0;
    if (urlData?.url) {
      currentUrlData.value = urlData;
      el.src = forceHttps(urlData.url);
      currentTime.value = 0;
      duration.value = (song.dt ?? urlData.time ?? 0) / 1000;
      try {
        await el.play();
      } catch {}
    } else {
      await playSongAt(0);
    }
  }

  /** 替换当前播放列表并开始播放 */
  function setPlaylist(songs: Song[], startIndex: number) {
    playlist.value = [...songs];
    playSongAt(startIndex);
  }

  function playNext() {
    if (currentIndex.value < playlist.value.length - 1) {
      playSongAt(currentIndex.value + 1);
    } else {
      log("info", "已经是最后一首了");
    }
  }

  function playPrev() {
    if (currentIndex.value > 0) {
      playSongAt(currentIndex.value - 1);
    } else {
      log("info", "已经是第一首了");
    }
  }

  async function toggle() {
    const el = audio.value;
    if (!el || !currentSong.value) return;
    if (el.paused) await el.play();
    else el.pause();
  }

  function seek(t: number) {
    const el = audio.value;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : t;
    el.currentTime = Math.max(0, Math.min(t, max));
    currentTime.value = el.currentTime;
  }

  function setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    volume.value = clamped;
    if (audio.value) audio.value.volume = clamped;
  }

  function pause() {
    audio.value?.pause();
  }

  function bindAudio(el: HTMLAudioElement | null) {
    audio.value = el;
    if (el) el.volume = volume.value;
  }

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
  }

  return {
    audio,
    playlist,
    currentIndex,
    currentSong,
    currentUrlData,
    isPlaying,
    currentTime,
    duration,
    volume,
    playLoading,
    playLevel,
    isCurrent,
    play,
    setPlaylist,
    playNext,
    playPrev,
    toggle,
    seek,
    setVolume,
    pause,
    bindAudio,
    isFullscreen,
    toggleFullscreen,
  };
}
