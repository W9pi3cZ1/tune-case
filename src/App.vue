<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { Component } from 'vue';
import IconGithub from '~icons/simple-icons/github';
import TabsNav from './components/TabsNav.vue';
import PlayerBar from './components/PlayerBar.vue';
import DownloadView from './views/DownloadView.vue';
import SettingsView from './views/SettingsView.vue';
import LogsView from './views/LogsView.vue';
import AccountView from './views/AccountView.vue';
import { useRoute } from './composables/useRoute';
import { usePlayer } from './composables/usePlayer';
import { useCookie } from './composables/useCookie';
import { useLog } from './composables/useLog';
import { useAuth } from './composables/useAuth';
import { useQrLogin } from './composables/useQrLogin';
import { useConfig } from './composables/useConfig';
import type { TabName } from './types';

const { current, go } = useRoute();
const { getCookie } = useCookie();
const { log } = useLog();
const { checkLoginStatus } = useAuth();
const { stopPolling } = useQrLogin();
const { syncFromStorage } = useConfig();
const { isPlaying, currentTime, duration, bindAudio } = usePlayer();

const views: Record<TabName, Component> = {
  main: DownloadView,
  settings: SettingsView,
  logs: LogsView,
  account: AccountView,
};

const active = computed<TabName>(() => current.value ?? 'main');
const currentView = computed(() => views[active.value]);

const audioEl = ref<HTMLAudioElement | null>(null);

function onAudioPlay() { isPlaying.value = true; }
function onAudioPause() { isPlaying.value = false; }
function onAudioTimeUpdate() {
  if (audioEl.value) currentTime.value = audioEl.value.currentTime;
}
function onAudioLoaded() {
  if (audioEl.value && Number.isFinite(audioEl.value.duration)) {
    duration.value = audioEl.value.duration;
  }
}
function onAudioEnded() { isPlaying.value = false; }

watch(active, (v) => {
  if (v !== 'account') stopPolling();
});

onMounted(async () => {
  bindAudio(audioEl.value);

  const initial = current.value ?? (getCookie() ? 'main' : 'account');
  if (!current.value) go(initial);
  log('info', '应用已就绪');
  if (getCookie()) {
    const ok = await checkLoginStatus();
    if (!ok) log('warn', '保存的登录状态已失效，请重新登录');
  }
  window.addEventListener('storage', (e) => {
    if (e.key === 'config') {
      syncFromStorage();
      log('info', '配置已从其他标签页同步');
    }
  });
});
</script>

<template>
  <header class="headline">
    <h2 style="font-size: 1em">网易云音乐下载器</h2>
    <a href="//github.com/W9pi3cZ1/ncmobile" target="_blank" rel="noopener" title="在 Github 上打开">
      <IconGithub />
    </a>
  </header>

  <TabsNav :current="active" @select="go" />

  <main>
    <KeepAlive>
      <component :is="currentView" :key="active" />
    </KeepAlive>
  </main>

  <audio
    ref="audioEl"
    preload="metadata"
    @play="onAudioPlay"
    @pause="onAudioPause"
    @timeupdate="onAudioTimeUpdate"
    @loadedmetadata="onAudioLoaded"
    @ended="onAudioEnded"
  />

  <PlayerBar />
</template>