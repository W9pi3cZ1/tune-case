import { ref } from "vue";
import QRCode from "qrcode";
import type { QrPlatform } from "../types";
import { useApi } from "./useApi";
import { useCookie } from "./useCookie";
import { useLog } from "./useLog";
import { useAuth } from "./useAuth";

const unikey = ref("");
const verifyUrl = ref("");
const qrDataUrl = ref("");
const qrCheckText = ref("");
const qrPlatform = ref<QrPlatform>("pc");
const polling = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function useQrLogin() {
  const { api } = useApi();
  const { getCookie, setCookie, setCookieSource, normalizeCookie, hasMusicU } =
    useCookie();
  const { log } = useLog();
  const { setMsg, checkLoginStatus } = useAuth();

  function generateChainId(cookie: string): string {
    const version = "v1";
    const randomNum = Math.floor(Math.random() * 1e6);
    const m = cookie ? /(?:^|;)\s*sDeviceId\s*=\s*([^;]+)/.exec(cookie) : null;
    const deviceId = m?.[1] || ("unknown-" + randomNum);
    return `${version}_${deviceId}_web_login_${Date.now()}`;
  }

  function buildVerifyUrl(key: string): string {
    let url = "https://music.163.com/st/platform/scanlogin?codekey=" +
      encodeURIComponent(key);
    if (qrPlatform.value === "web") {
      url += "&chainId=" + encodeURIComponent(generateChainId(getCookie()));
    }
    return url;
  }

  async function renderQrImage(url: string) {
    if (!url) {
      qrDataUrl.value = "";
      return;
    }
    try {
      qrDataUrl.value = await QRCode.toDataURL(url, {
        width: 360,
        margin: 1,
        errorCorrectionLevel: "M",
      });
    } catch (e) {
      qrDataUrl.value = "";
      log("warn", "二维码生成失败：" + (e as Error).message);
    }
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
      polling.value = false;
    }
  }

  function startPolling(key: string) {
    stopPolling();
    polling.value = true;
    let lastCode: number | null = null;

    pollTimer = setInterval(async () => {
      try {
        const res = await api<any>(
          "/login/qr/check",
          { key, noCookie: "true" },
          { omitCookie: true },
        );
        qrCheckText.value = JSON.stringify(res, null, 2);

        const code = res.code;
        if (code === 800) {
          stopPolling();
          qrCheckText.value += '\n\n[二维码已过期，请点击"刷新"]';
          log("warn", "二维码已过期");
        } else if (code === 801) {
          if (lastCode !== 801) log("info", "等待扫码…");
        } else if (code === 802) {
          if (lastCode !== 802) log("info", "已扫码，等待手机端确认…");
        } else if (code === 803) {
          stopPolling();
          const ck = normalizeCookie(res.cookie);
          if (ck) {
            setCookie(ck);
            setCookieSource("qr");
            if (!hasMusicU(ck)) {
              log("warn", "登录返回的 Cookie 里没有 MUSIC_U，可能未真正生效");
            }
          } else {
            log("warn", "803 响应里没有可用 cookie 字段");
          }
          log("info", "扫码登录成功");
          const ok = await checkLoginStatus();
          setMsg(ok ? "登录成功" : "登录校验失败", ok ? "ok" : "err");
          if (ok) location.hash = "main";
        }
        lastCode = code;
      } catch (e) {
        log("error", "QR 轮询失败：" + (e as Error).message);
      }
    }, 3000);
  }

  async function refreshQrKey() {
    stopPolling();
    unikey.value = "";
    verifyUrl.value = "";
    qrDataUrl.value = "";
    qrCheckText.value = "";

    try {
      const res = await api<any>("/login/qr/key");
      const key = res?.data?.unikey;
      if (!key) throw new Error("未获取到 unikey");

      unikey.value = key;
      verifyUrl.value = buildVerifyUrl(key);
      await renderQrImage(verifyUrl.value);
      log("info", `已生成登录二维码（平台：${qrPlatform.value}）`);
      startPolling(key);
    } catch (e) {
      log("error", "生成二维码失败：" + (e as Error).message);
      throw e;
    }
  }

  async function setPlatform(p: QrPlatform) {
    if (qrPlatform.value === p) return;
    qrPlatform.value = p;
    if (unikey.value) {
      verifyUrl.value = buildVerifyUrl(unikey.value);
      await renderQrImage(verifyUrl.value);
      log("info", `已切换平台为 ${p}，二维码已更新`);
    }
  }

  function jumpToOrpheus() {
    if (!unikey.value) {
      log("warn", '请先点击"刷新"获取 unikey');
      return;
    }
    const url = buildVerifyUrl(unikey.value);
    verifyUrl.value = url;
    const orpheusUrl = "orpheus://openurl?url=" + encodeURIComponent(url);
    log("info", `尝试唤起 Orpheus 客户端（平台：${qrPlatform.value}）`);

    try {
      window.location.href = orpheusUrl;
    } catch { /* ignore */ }

    setTimeout(() => {
      setMsg("如果没自动打开，请使用二维码扫码或手动打开验证链接。", "muted");
    }, 800);
  }

  function reset() {
    stopPolling();
    unikey.value = "";
    verifyUrl.value = "";
    qrDataUrl.value = "";
    qrCheckText.value = "";
  }

  return {
    unikey,
    verifyUrl,
    qrDataUrl,
    qrCheckText,
    qrPlatform,
    polling,
    refreshQrKey,
    stopPolling,
    setPlatform,
    jumpToOrpheus,
    reset,
  };
}
