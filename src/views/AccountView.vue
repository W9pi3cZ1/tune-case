<script setup lang="ts">
import { computed, onActivated, onUnmounted, ref, watch } from 'vue';
import type { LoginMethod } from '../types';
import { useAuth } from '../composables/useAuth';
import { useCookie } from '../composables/useCookie';
import { parseCookieFile } from '../utils/cookieParser';
import { useLog } from '../composables/useLog';
import { useQrLogin } from '../composables/useQrLogin';
import { useRoute } from '../composables/useRoute';

const { profile, loginMsg, loginMsgType, checkLoginStatus, logout } = useAuth();
const { setCookie, setCookieSource } = useCookie();
const { log } = useLog();
const { go } = useRoute();
const {
  unikey, verifyUrl, qrDataUrl, qrCheckText, qrPlatform, polling,
  refreshQrKey, setPlatform, jumpToOrpheus, stopPolling, reset,
} = useQrLogin();

const method = ref<LoginMethod>('qr');
const cookieFile = ref<File | null>(null);
const musicU = ref('');
const submitting = ref(false);

const showQr = computed(() => method.value === 'qr');
const showCookie = computed(() => method.value === 'cookie');
const showMusicU = computed(() => method.value === 'music-u');

watch(method, async (v) => {
  if (v !== 'qr') stopPolling();
  if (v === 'qr' && !unikey.value && !polling.value) {
    try { await refreshQrKey(); } catch { /* logged inside */ }
  }
}, { immediate: true });

function onCookieFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  cookieFile.value = files && files[0] ? files[0] : null;
}

async function onSubmit() {
  submitting.value = true;
  try {
    if (method.value === 'cookie') {
      if (!cookieFile.value) throw new Error('请选择 Cookies 文件');
      const text = await cookieFile.value.text();
      if (!text.trim()) throw new Error('Cookies 文件为空');

      const result = parseCookieFile(text);
      if (!result.header) {
        throw new Error('未能从文件中解析出 Cookie（支持 Netscape / JSON / header string）');
      }
      if (result.droppedDomain > 0) log('warn', `已忽略 ${result.droppedDomain} 个非 163 域名的 cookie`);
      if (result.droppedExpired > 0) log('warn', `已忽略 ${result.droppedExpired} 个已过期的 cookie`);
      if (!result.hasMusicU) log('warn', '导入的 Cookie 中没有 MUSIC_U，登录大概率会失败');

      setCookie(result.header);
      setCookieSource('external');   // ← 新增
      log('info', `已导入 Cookie：${result.kept} 项（原始解析 ${result.total} 项）`);

    } else if (method.value === 'music-u') {
      const v = musicU.value.trim();
      if (!v) throw new Error('请输入 MUSIC_U');
      setCookie(/^MUSIC_U=/.test(v) ? v : 'MUSIC_U=' + v);
      setCookieSource('external');   // ← 新增
      log('info', '已保存 MUSIC_U');
    }
    const ok = await checkLoginStatus();
    if (ok) go('main');
  } catch (e) {
    log('error', (e as Error).message);
  } finally {
    submitting.value = false;
  }
}

// 1. 加上 onActivated 兜底（解决切走再切回的情况）
onActivated(() => {
  if (method.value === 'qr' && !unikey.value && !polling.value) {
    refreshQrKey().catch(() => { /* 内部已 log */ });
  }
});

// 2. 修改登出逻辑
async function onLogout() {
  await logout();
  reset();
  
  // 登出后，如果当前停留在二维码登录界面，立即拉取新的二维码
  if (method.value === 'qr') {
    refreshQrKey().catch(() => { /* 内部已 log */ });
  }
}

onUnmounted(() => stopPolling());
</script>

<template>
  <fieldset>
    <legend>账号信息</legend>
    <div v-if="!profile" class="muted">未登录</div>
    <div v-else class="account-card">
      <img v-if="profile.avatarUrl" class="avatar" :src="profile.avatarUrl" alt="" />
      <div class="account-meta">
        <div class="account-name">{{ profile.nickname || '未知用户' }}</div>
        <div class="muted small">
          UID {{ profile.userId ?? '-' }} · {{ (profile.vipType ?? 0) > 0 ? 'VIP' : '普通用户' }}
        </div>
        <div v-if="profile.signature" class="muted small">{{ profile.signature }}</div>
      </div>
      <button type="button" class="ghost" @click="onLogout">退出登录</button>
    </div>
  </fieldset>

  <fieldset>
    <legend>登录方式</legend>
    <label><input v-model="method" name="login-method" type="radio" value="qr" /> QR扫码（移动端）</label><br />
    <label><input v-model="method" name="login-method" type="radio" value="cookie" /> 导入 Cookies.TXT</label><br />
    <label><input v-model="method" name="login-method" type="radio" value="music-u" /> 直接键入 MUSIC_U</label><br />
  </fieldset>

  <fieldset>
    <legend>登录参数</legend>

    <template v-if="showQr">
      <p class="small muted" style="margin:0 0 8px">
        请使用移动端网易云 App 扫码，或点「跳转到客户端」唤起 Orpheus。
      </p>
      <div class="row" style="margin-bottom:8px">
        <label for="qr-unikey" class="small muted">验证 key：</label>
        <input id="qr-unikey" :value="unikey" type="text" disabled style="flex:1;min-width:160px" />
        <input type="button" value="刷新" @click="refreshQrKey" />
        <input type="button" value="跳转到客户端" @click="jumpToOrpheus" />
      </div>
      <div class="row" style="margin-bottom:8px">
        <span class="small muted">平台：</span>
        <button type="button" class="plat-btn" :class="{ active: qrPlatform === 'pc' }"
          @click="setPlatform('pc')">PC</button>
        <button type="button" class="plat-btn" :class="{ active: qrPlatform === 'web' }"
          @click="setPlatform('web')">Web</button>
        <span class="muted small" style="margin-left:auto">
          二维码由本地根据新 scanlogin URL 生成，不依赖 /login/qr/create
        </span>
      </div>
      <div class="row" style="margin-bottom:8px">
        <span class="small muted">验证 URL：</span>
        <a v-if="verifyUrl" :href="verifyUrl" class="verify-url" target="_blank" rel="noopener">{{ verifyUrl }}</a>
        <span v-else class="verify-url">—</span>
      </div>
      <div style="display:flex; padding:4px 0; gap:8px; flex-wrap:wrap;">
        <div id="qr-box">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="登录二维码" />
          <span v-else>二维码占位</span>
        </div>
        <textarea :value="qrCheckText" style="flex:1;min-width:200px" placeholder="等待 QR Check 的响应..."
          readonly></textarea>
      </div>
    </template>

    <template v-else-if="showCookie">
      <label class="small">选择 Cookies.TXT：
        <input type="file" accept=".txt,.json,text/plain,application/json" @change="onCookieFileChange" />
      </label>
      <p class="muted small" style="margin:8px 0 0">
        支持 Netscape cookies.txt、浏览器扩展导出的 JSON、以及单行 header string（<code>k=v; k=v</code>）。
      </p>
    </template>

    <template v-else-if="showMusicU">
      <label class="small">MUSIC_U：<br />
        <textarea v-model="musicU" placeholder="粘贴 MUSIC_U 值" autocomplete="off"></textarea>
      </label>
    </template>
  </fieldset>

  <fieldset>
    <legend>登录测试</legend>
    <button type="submit" :disabled="submitting" @click.prevent="onSubmit">测试并应用</button>
    <span role="status" style="margin-left:8px"
      :style="{ color: loginMsgType === 'ok' ? 'var(--ok)' : loginMsgType === 'err' ? 'var(--err)' : 'var(--muted)' }">{{
        loginMsg }}</span>
  </fieldset>
</template>
