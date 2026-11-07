export function forceHttps(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  if (url.startsWith("//")) {
    return "https:" + url;
  }
  return url;
}
