<script setup lang="ts">
import { ref, watch } from 'vue';
import { useConfig } from '../composables/useConfig';
import { useLog } from '../composables/useLog';

const { config, saveConfig, resetConfig } = useConfig();
const { log } = useLog();

const baseUrlInput = ref(config.value.base_url);
const themeSelect = ref(config.value.theme);

watch(() => config.value.base_url, v => { baseUrlInput.value = v; });
watch(() => config.value.theme, v => { themeSelect.value = v; });

function saveBase() {
  const v = baseUrlInput.value.trim();
  if (!v) { log('warn', 'BaseURL 不能为空'); return; }
  saveConfig({ base_url: v });
  log('info', 'API BaseURL 已保存：' + v);
}
function resetBase() {
  resetConfig('base_url');
  baseUrlInput.value = config.value.base_url;
  log('info', 'BaseURL 已重置为默认值');
}
function onThemeChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value as 'auto' | 'light' | 'dark';
  saveConfig({ theme: v });
}
function onConcurrencyChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  saveConfig({ concurrency: v });
}

</script>

<template>
  <fieldset>
    <legend>NCM API Enhanced 配置选项</legend>
    <div class="field">
      <label for="api-base" class="small muted">基本路径 / BaseURL：</label>
      <div class="row">
        <input id="api-base" v-model="baseUrlInput" type="text" placeholder="在此键入 API base ..."
          style="flex:1;min-width:200px" />
        <input type="button" value="保存" @click="saveBase" />
        <input type="button" value="重置" @click="resetBase" />
      </div>
      <div class="muted small" style="margin-top:6px">
        需要部署一份
        <a href="https://github.com/neteasecloudmusicapienhanced/api-enhanced" target="_blank" rel="noopener">
          NCM API Enhanced
        </a>
        实例，并且允许本页面跨域访问。
      </div>
    </div>
  </fieldset>
  <fieldset>
    <legend>外观</legend>
    <div class="field">
      <label for="theme-select" class="small muted">主题：</label>
      <select id="theme-select" :value="themeSelect" @change="onThemeChange">
        <option value="auto">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </div>
  </fieldset>
  <fieldset>
    <legend>下载设置</legend>
    <div class="field">
      <label for="concurrency" class="small muted">并发下载数（1-128）：</label>
      <div class="row">
        <input id="concurrency" type="range" min="1" max="128" step="1" :value="config.concurrency"
          @input="onConcurrencyChange" style="flex:1; max-width:100%;" />
        <span class="small">{{ config.concurrency }} 个任务同时下载</span>
      </div>
      <div class="muted small">
        并发越高下载越快，但会占用更多内存和带宽。打包大量无损歌曲时建议使用 1-2 个并发，以防浏览器内存不足导致崩溃。
      </div>
    </div>
  </fieldset>
</template>
