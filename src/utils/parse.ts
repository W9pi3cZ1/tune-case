import type { ParseResult } from "../types";

/**
 * 从网易云分享文案中提取纯净的 URL
 * 如果本身不是分享文案，则原样返回（交给后续搜索）
 */
export function extractUrl(text: string): string {
  const s = text.trim();
  // 如果本身就是纯链接，直接返回
  if (/^https?:\/\//i.test(s)) return s;

  // 匹配网易云短链 (163cn.tv) 或 长链 (music.163.com 及其子域)
  // 只要遇到空格、中文、括号等字符就会截断，防止把分享文案尾部带进去
  const match = s.match(
    /https?:\/\/(?:[\w-]+\.)?(?:music\.163\.com|163cn\.tv)\/[a-zA-Z0-9\-._~:/?#@!$&+,;=%]*/i,
  );

  if (match) {
    return match[0];
  }

  return s;
}

export function parseInput(raw: string): ParseResult {
  const s = raw.trim();
  if (!s) throw new Error("请输入内容");
  if (/^\d+$/.test(s)) return { type: "song", id: s };
  if (!/^https?:\/\//i.test(s)) throw new Error("NOT_A_LINK");

  const playlistId = s.match(/playlist[\/?#].*?id=(\d+)/i)?.[1] ||
    s.match(/[?&#]id=(\d+)/)?.[1];
  const albumId = s.match(/album[\/?#].*?id=(\d+)/i)?.[1];
  const artistId = s.match(/artist[\/?#].*?id=(\d+)/i)?.[1]; // 新增
  const songId = s.match(/song[\/?#].*?id=(\d+)/i)?.[1] ||
    s.match(/[?&#]id=(\d+)/)?.[1];

  if (/playlist|toplist/i.test(s) && playlistId) {
    return { type: "playlist", id: playlistId };
  }
  if (/album/i.test(s) && albumId) return { type: "album", id: albumId };
  if (/artist/i.test(s) && artistId) return { type: "artist", id: artistId }; // 新增
  if (songId) return { type: "song", id: songId };

  const anyId = s.match(/(\d{5,})/)?.[1];
  if (anyId) return { type: "song", id: anyId };

  throw new Error("无法从链接中识别出 ID");
}
