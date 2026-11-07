import { ref } from "vue";
import type { AppConfig } from "../types";

const CONFIG_KEY = "config";
const DEFAULT_CONFIG: AppConfig = {
  base_url: "https://ncmapi.xslimenb.eu.org/",
  theme: "auto",
};

function readConfig(): AppConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (raw && typeof raw === "object") return { ...DEFAULT_CONFIG, ...raw };
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

const config = ref<AppConfig>(readConfig());
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const mode = config.value.theme;
  const dark = mode === "dark" || (mode === "auto" && systemDark.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

function persist() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value));
}

applyTheme();
systemDark.addEventListener("change", applyTheme);

export function useConfig() {
  function saveConfig(patch: Partial<AppConfig>) {
    config.value = { ...config.value, ...patch };
    persist();
    applyTheme();
  }
  function resetConfig(key?: keyof AppConfig) {
    if (!key || key === "base_url") {
      config.value.base_url = DEFAULT_CONFIG.base_url;
    }
    if (!key || key === "theme") config.value.theme = DEFAULT_CONFIG.theme;
    persist();
    applyTheme();
  }
  function syncFromStorage() {
    config.value = readConfig();
    applyTheme();
  }
  return { config, saveConfig, resetConfig, applyTheme, syncFromStorage };
}
