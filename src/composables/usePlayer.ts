import { ref } from 'vue';
import type { Song, SongUrlData } from '../types';

const audio = ref<HTMLAudioElement | null>(null);
const currentSong = ref<Song | null>(null);
const currentUrlData = ref<SongUrlData | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(1);

export function usePlayer() {
  const isCurrent = (id: number) => currentSong.value?.id === id;

  /**
   * 播放入口。同一个 id 再次调用是 toggle 语义，
   * 不同 id 则切换并开始播放。
   */
  async function play(song: Song, urlData: SongUrlData): Promise<void> {
  const el = audio.value;
  if (!el || !urlData.url) return;

  if (currentSong.value?.id === song.id) {
    if (el.paused) await el.play();
    else el.pause();
    return;
  }

  currentSong.value = song;
  currentUrlData.value = urlData;
  el.src = urlData.url;
  currentTime.value = 0;

  // dt（毫秒）是权威时长；urlData.time 次之；
  // 都没有就先显示 0:00，等 loadedmetadata 事件纠正
  const dtMs = song.dt ?? 0;
  duration.value = dtMs > 0 ? dtMs / 1000 : 0;

  try {
    await el.play();
  } catch {
    /* 自动播放被拦，UI 会显示暂停态 */
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

  function pause() { audio.value?.pause(); }

  function reset() {
    const el = audio.value;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    currentSong.value = null;
    currentUrlData.value = null;
    isPlaying.value = false;
    currentTime.value = 0;
    duration.value = 0;
  }

  /** 由 App.vue 把 <audio> 元素绑进来 */
  function bindAudio(el: HTMLAudioElement | null) {
    audio.value = el;
    if (el) el.volume = volume.value;
  }

  return {
    audio, currentSong, currentUrlData, isPlaying, currentTime, duration, volume,
    isCurrent, play, toggle, seek, setVolume, pause, reset, bindAudio,
  };
}