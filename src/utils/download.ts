import { useLog } from "../composables/useLog";
import { embedMetadata, type TagData } from "./tagWriter";

export function safeFilename(s: string): string {
  return String(s || "download")
    .replace(/[\\/:*?"<>|\r\n]/g, "_")
    .slice(0, 120);
}

export async function triggerDownload(
  url: string,
  filename: string,
  tags?: TagData,
): Promise<boolean> {
  const { log } = useLog();
  try {
    const r = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!r.ok) throw new Error("HTTP " + r.status);

    const original = await r.arrayBuffer();
    let finalBytes: BlobPart = original;
    const mime = r.headers.get("content-type") || "audio/mpeg";

    if (tags) {
      finalBytes = await embedMetadata(original, tags);
    }

    const blob = new Blob([finalBytes], { type: mime });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    return true;
  } catch (e) {
    log("warn", "blob 下载失败，改为新窗口打开：" + (e as Error).message);
    window.open(url, "_blank", "noopener");
    return false;
  }
}

export interface ProgressInfo {
  /** 已接收字节数 */
  received: number;
  /** 总字节数；0 表示服务端未给 content-length */
  total: number;
}

export interface FetchWithProgressOptions {
  signal?: AbortSignal;
  onProgress?: (p: ProgressInfo) => void;
}

export async function fetchWithProgress(
  url: string,
  opts: FetchWithProgressOptions = {},
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: opts.signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const contentType = res.headers.get('content-type') || '';
  const total = Number(res.headers.get('content-length') || 0);

  if (!res.body) {
    // 老浏览器 / 无 stream 支持
    const buf = await res.arrayBuffer();
    opts.onProgress?.({ received: buf.byteLength, total: buf.byteLength });
    return { buffer: buf, contentType };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  opts.onProgress?.({ received, total });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    opts.onProgress?.({ received, total });
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { buffer: out.buffer, contentType };
}

export function saveBlob(blob: Blob, filename: string): void {
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
}