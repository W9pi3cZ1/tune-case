export async function resolveShortLink(url: string): Promise<string> {
  // 支持 163cn.tv 以及新版可能出现的 163cn.link 域名
  if (!/163cn\.(tv|link)/i.test(url)) {
    return url;
  }

  const proxyUrl = `https://fuck-cors.xslimenb.eu.org/?url=${encodeURIComponent(url)}`;

  try {
    // 原生 AbortSignal.timeout 超时控制，3秒没响应直接放弃，防止卡死主流程
    const response = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return url;

    const data = await response.json();
    // 确认代理返回了有效长链接才替换
    if (data && data.original && data.original !== 'null') {
      return data.original;
    }
  } catch (error) {
    console.warn('[短链解析] Worker 请求失败或超时:', error);
  }

  // 兜底：解析失败直接返回短链，交给后续 parseInput 抛出格式错误
  return url;
}