import { applyCoverArt, applyTags, readCoverArt } from "taglib-wasm/simple";

export interface TagData {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
}
// src/utils/tagWriter.ts（在 embedMetadata 函数内部扩展）

import { sniffImageMimeType } from "./coverRepair"; // 上面写的检测函数

export async function embedMetadata(
  audioBuffer: ArrayBuffer,
  tags: TagData,
): Promise<Uint8Array<ArrayBuffer>> {
  let result = await applyTags(audioBuffer, {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
  });

  // 1. 读文件自带的封面（若存在）
  let existingCover: Uint8Array | undefined;
  try {
    existingCover = await readCoverArt(result);
  } catch {
    // 文件损坏 / 格式不支持时 readCoverArt 会 throw，降级为「当作没封面」
    existingCover = undefined;
  }

  if (existingCover && existingCover.length > 0) {
    // 2. 有自带封面：sniff 真实格式，用真实 MIME 重写同一张图
    const realMime = sniffImageMimeType(existingCover);
    if (realMime) {
      result = await applyCoverArt(result, existingCover, realMime);
    }
    // sniff 不出（null）说明图片数据本身可能已损坏，
    // 保留原样，避免用无效数据覆盖
    return result as Uint8Array<ArrayBuffer>;
  }

  // 3. 无自带封面：走远程下载
  if (tags.coverUrl) {
    try {
      const res = await fetch(tags.coverUrl);
      if (res.ok) {
        const coverData = new Uint8Array(await res.arrayBuffer());
        const realMime = sniffImageMimeType(coverData) || "image/jpeg";
        result = await applyCoverArt(result, coverData, realMime);
      }
    } catch {
      // 封面下载/CORS 失败，静默降级
    }
  }

  return result as Uint8Array<ArrayBuffer>;
}
