import { ref } from "vue";

const COOKIE_KEY = "ncm.cookie";
const COOKIE_SOURCE_KEY = "ncm.cookie.source";

export type CookieSource = "qr" | "external";

function readSource(): CookieSource | null {
  const v = localStorage.getItem(COOKIE_SOURCE_KEY);
  return v === "qr" || v === "external" ? v : null;
}

const cookie = ref<string>(localStorage.getItem(COOKIE_KEY) || "");
const cookieSource = ref<CookieSource | null>(readSource());

export function useCookie() {
  function getCookie() {
    return cookie.value;
  }
  function getCookieSource() {
    return cookieSource.value;
  }

  function setCookieSource(s: CookieSource | null) {
    cookieSource.value = s;
    if (s) localStorage.setItem(COOKIE_SOURCE_KEY, s);
    else localStorage.removeItem(COOKIE_SOURCE_KEY);
  }

  function setCookie(v: string) {
    cookie.value = v || "";
    if (v) {
      localStorage.setItem(COOKIE_KEY, v);
    } else {
      localStorage.removeItem(COOKIE_KEY);
      // 清空 cookie 时自动清来源，避免残留状态
      setCookieSource(null);
    }
  }

  // —— 以下三个保持原样 ——
  function hasCookieKey(c: string, key: string): boolean {
    if (!c) return false;
    try {
      return new RegExp(
        "(?:^|;)\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=",
      ).test(c);
    } catch {
      return false;
    }
  }
  function hasMusicU(c: string) {
    return hasCookieKey(c, "MUSIC_U");
  }

  function normalizeCookie(input: unknown): string {
    if (!input) return "";
    const arr: unknown[] = Array.isArray(input) ? input : [input];
    const IGNORE = new Set([
      "Max-Age",
      "Expires",
      "Path",
      "Domain",
      "Secure",
      "HttpOnly",
      "SameSite",
      "Priority",
      "Version",
      "Comment",
      "Partitioned",
    ]);
    const map = new Map<string, string>();
    for (const item of arr) {
      if (!item) continue;
      if (typeof item === "string") {
        for (const part of item.split(";")) {
          const s = part.trim();
          if (!s) continue;
          const eq = s.indexOf("=");
          if (eq <= 0) continue;
          const key = s.slice(0, eq).trim();
          const val = s.slice(eq + 1).trim();
          if (!key || IGNORE.has(key) || val === "") continue;
          map.set(key, val);
        }
      } else if (typeof item === "object") {
        const obj = item as { name?: string; value?: string };
        if (obj.name) {
          const v = String(obj.value ?? "");
          if (v !== "") map.set(obj.name, v);
        }
      }
    }
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  return {
    cookie,
    getCookie,
    setCookie,
    getCookieSource,
    setCookieSource,
    hasCookieKey,
    hasMusicU,
    normalizeCookie,
  };
}
