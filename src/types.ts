export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  t: Date;
  level: LogLevel;
  msg: string;
}

export interface AppConfig {
  base_url: string;
  theme: "auto" | "light" | "dark";
}

export type QualityLevel =
  | "standard"
  | "higher"
  | "exhigh"
  | "lossless"
  | "hires"
  | "jyeffect"
  | "sky";

export interface Artist {
  id?: number;
  name: string;
}
export interface Album {
  id?: number;
  name: string;
  picUrl?: string;
}

export interface Song {
  id: number;
  name: string;
  ar?: Artist[];
  artists?: Artist[];
  al?: Album;
  album?: Album;
  dt?: number;
}

export interface SongUrlData {
  id?: number;
  url: string | null;
  type?: string;
  level?: string;
  br?: number;
  size?: number;
}

export interface UserProfile {
  userId: number;
  nickname: string;
  avatarUrl?: string;
  vipType?: number;
  signature?: string;
}

export interface ParseResult {
  type: "song" | "playlist" | "album";
  id: string;
}

export type TabName = "main" | "settings" | "logs" | "account";
export type LoginMethod = "qr" | "cookie" | "music-u";
export type QrPlatform = "pc" | "web";
