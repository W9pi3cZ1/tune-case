// 有时网易云拿到的flac其封面是写坏的，然后大多数这种音频文件都来自Dizzylab😅
// 于是我写了下面的函数↓
export function sniffImageMimeType(data: Uint8Array): string | null {
  if (data.length < 4) return null;

  // JPEG: FF D8 FF
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47
  ) {
    return "image/png";
  }
  // GIF: 47 49 46 38 (GIF8)
  if (
    data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38
  ) {
    return "image/gif";
  }
  // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP) at offset 8
  if (
    data.length >= 12 &&
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }

  return null; // 无法识别的格式
}
