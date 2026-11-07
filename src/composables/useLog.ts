import { computed, ref } from "vue";
import type { LogEntry, LogLevel } from "../types";

const LOG_LIMIT = 400;
const logs = ref<LogEntry[]>([]);

export function useLog() {
  function log(level: LogLevel, msg: string) {
    logs.value.push({ t: new Date(), level, msg });
    if (logs.value.length > LOG_LIMIT) logs.value.shift();
    const fn = level === "error"
      ? console.error
      : level === "warn"
      ? console.warn
      : console.log;
    fn("[ncm]", msg);
  }
  function clear() {
    logs.value = [];
  }
  const count = computed(() => logs.value.length);
  return { logs, log, clear, count };
}
