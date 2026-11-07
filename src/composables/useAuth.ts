import { ref } from "vue";
import type { UserProfile } from "../types";
import { useApi } from "./useApi";
import { useCookie } from "./useCookie";
import { useLog } from "./useLog";

const profile = ref<UserProfile | null>(null);
const status = ref<"unknown" | "checking" | "valid" | "invalid">("unknown");
const loginMsg = ref("");
const loginMsgType = ref<"muted" | "ok" | "err">("muted");

export function useAuth() {
  const { api } = useApi();
  const { getCookie, setCookie, getCookieSource } = useCookie();
  const { log } = useLog();

  function setMsg(text: string, type: "muted" | "ok" | "err" = "muted") {
    loginMsg.value = text;
    loginMsgType.value = type;
  }

  async function checkLoginStatus(): Promise<boolean> {
    const ck = getCookie();
    if (!ck) {
      profile.value = null;
      status.value = "invalid";
      return false;
    }
    status.value = "checking";
    try {
      const res = await api<any>("/login/status");
      const data = res?.data || res;
      if (data?.profile) {
        profile.value = data.profile;
        status.value = "valid";
        log("info", `登录状态有效：${data.profile.nickname}`);
        return true;
      }
      profile.value = null;
      status.value = "invalid";
      log("warn", "登录状态已失效或没有 MUSIC_U");
      return false;
    } catch (e) {
      profile.value = null;
      status.value = "invalid";
      log("error", "校验登录状态失败：" + (e as Error).message);
      return false;
    }
  }

  async function logout(): Promise<void> {
    const ck = getCookie();
    const source = getCookieSource();

    // 只有扫码登录（会话由我们建立）才调用服务端登出。
    // 外部导入的 cookie 是用户在别处建立的会话，不能替用户销毁。
    // source 为 null（旧数据）时按 external 处理，保守起见不调 API。
    if (ck && source === "qr") {
      try {
        setMsg("正在退出登录...", "muted");
        await api("/logout", { cookie: ck });
        log("info", "服务端登出成功");
      } catch (e) {
        log(
          "warn",
          "服务端登出失败（可能已过期），但仍会清理本地状态：" +
            (e as Error).message,
        );
      }
    } else if (ck) {
      log("info", "当前 Cookie 为外部导入，已跳过服务端登出以保留原会话");
    }

    // setCookie('') 会顺带清空 source
    setCookie("");
    profile.value = null;
    status.value = "invalid";
    setMsg("已退出登录", "muted");
  }

  return {
    profile,
    status,
    loginMsg,
    loginMsgType,
    setMsg,
    checkLoginStatus,
    logout,
  };
}
