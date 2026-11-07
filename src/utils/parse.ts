import type { ParseResult } from '../types';

export function parseInput(raw: string): ParseResult {
    const s = raw.trim();
    if (!s) throw new Error('请输入内容');
    if (/^\d+$/.test(s)) return { type: 'song', id: s };
    if (!/^https?:\/\//i.test(s)) throw new Error('请输入网易云链接或纯数字 ID');

        const playlistId = s.match(/playlist[\/?#].*?id=(\d+)/i)?.[1] || s.match(/[?&#]id=(\d+)/)?.[1];
    const albumId = s.match(/album[\/?#].*?id=(\d+)/i)?.[1];
    const songId = s.match(/song[\/?#].*?id=(\d+)/i)?.[1] || s.match(/[?&#]id=(\d+)/)?.[1];

    if (/playlist|toplist/i.test(s) && playlistId) return { type: 'playlist', id: playlistId };
    if (/album/i.test(s) && albumId) return { type: 'album', id: albumId };
    if (songId) return { type: 'song', id: songId };

    const anyId = s.match(/(\d{5,})/)?.[1];
    if (anyId) return { type: 'song', id: anyId };

    throw new Error('无法从链接中识别出 ID');
}
