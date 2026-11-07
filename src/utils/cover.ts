export function getOptimizedCoverUrl(originalUrl?: string): string | undefined {
  if (!originalUrl) return undefined;
  
  // 如果已经有参数，直接追加；否则用 ? 拼接
  const separator = originalUrl.includes('?') ? '&' : '?';
  const jpg_url = originalUrl.replace(/\.png(\?|$)/i, '.jpg$1');
  
  // 请求 1024x1024 的裁剪图，避免 3K 图撑爆 FLAC 标签
  return `${jpg_url}${separator}param=1024y1024`;
}