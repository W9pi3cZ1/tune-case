export interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
  /** Unix 秒 */
  expiration?: number;
}

export interface ParseCookieResult {
  /** 可直接放进 `cookie` 查询参数的值：`k=v; k=v` */
  header: string;
  /** 解析出的原始条目数 */
  total: number;
  /** 最终保留的条目数 */
  kept: number;
  /** 因非 163 域名被丢弃 */
  droppedDomain: number;
  /** 因过期被丢弃 */
  droppedExpired: number;
  hasMusicU: boolean;
}

/* ---------- 基础工具 ---------- */

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** 秒级时间戳；>1e12 视为毫秒自动换算 */
function normalizeExp(exp?: number): number | undefined {
  if (exp == null || !Number.isFinite(exp) || exp <= 0) return undefined;
  return exp > 1e12 ? Math.floor(exp / 1000) : exp;
}

function isExpired(exp?: number, now = Date.now()): boolean {
  if (!exp) return false;
  return exp * 1000 < now;
}

/** 只保留 163 / music.163.com 及其子域；无 domain 信息时放行 */
function isNeteaseDomain(domain?: string): boolean {
  if (!domain) return true;
  const d = domain.replace(/^\./, '').trim().toLowerCase();
  if (!d) return true;
  return d === '163.com' || d.endsWith('.163.com');
}

/* ---------- 三种格式的解析 ---------- */

/** Netscape：domain \t flag \t path \t secure \t expiration \t name \t value */
function parseNetscapeLine(line: string): ParsedCookie | null {
  const cols = line.split('\t');
  if (cols.length < 7) return null;
  const [domain, , , , expStr, name, ...rest] = cols;
  if (!name) return null;
  const value = rest.join('\t');
  return {
    name: name.trim(),
    value: value.trim(),
    domain: domain.trim(),
    expiration: normalizeExp(Number(expStr)),
  };
}

/** Header String 的一段：`k=v` */
function parseHeaderSegment(seg: string): ParsedCookie | null {
  const eq = seg.indexOf('=');
  if (eq <= 0) return null;
  const name = seg.slice(0, eq).trim();
  const value = seg.slice(eq + 1).trim();
  if (!name) return null;
  return { name, value };
}

/** JSON：数组 / {cookies:[...]} / 纯对象，三种都兼容 */
function parseJsonCookies(text: string): ParsedCookie[] | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }

  let arr: any[];
  if (Array.isArray(obj)) {
    arr = obj;
  } else if (obj && typeof obj === 'object' && Array.isArray((obj as any).cookies)) {
    arr = (obj as any).cookies;
  } else if (obj && typeof obj === 'object') {
    arr = Object.entries(obj as Record<string, unknown>)
      .map(([k, v]) => ({ name: k, value: String(v) }));
  } else {
    return [];
  }

  const out: ParsedCookie[] = [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    const name = String(c.name ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      value: String(c.value ?? ''),
      domain: typeof c.domain === 'string' ? c.domain : undefined,
      expiration: normalizeExp(
        typeof c.expirationDate === 'number'
          ? c.expirationDate
          : typeof c.expiration === 'number'
            ? c.expiration
            : undefined
      ),
    });
  }
  return out;
}

/** 逐行解析：兼容 Netscape 与「每行/单行 `k=v; k=v`」 */
function parseLines(text: string): ParsedCookie[] {
  const out: ParsedCookie[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    // 关键：Netscape 的 HttpOnly 行以 `#HttpOnly_` 开头，但它不是注释！
    let isHttpOnlyNetscape = false;
    if (/^#HttpOnly_/i.test(line)) {
      isHttpOnlyNetscape = true;
      line = line.replace(/^#HttpOnly_/i, '');
    }
    if (!isHttpOnlyNetscape && line.startsWith('#')) continue;

    // Netscape：含 tab 且能切出 >= 7 列
    if (line.includes('\t')) {
      const c = parseNetscapeLine(line);
      if (c) {
        out.push(c);
        continue;
      }
    }

    // Header String / 每行一条：按 `;` 拆段
    for (const seg of line.split(';')) {
      const s = seg.trim();
      if (!s) continue;
      const c = parseHeaderSegment(s);
      if (c) out.push(c);
    }
  }
  return out;
}

/* ---------- 主入口 ---------- */

export function parseCookieFile(text: string): ParseCookieResult {
  const empty: ParseCookieResult = {
    header: '', total: 0, kept: 0,
    droppedDomain: 0, droppedExpired: 0, hasMusicU: false,
  };

  const clean = stripBom(text).trim();
  if (!clean) return empty;

  const looksJson = clean.startsWith('{') || clean.startsWith('[');
  let parsed: ParsedCookie[];
  if (looksJson) {
    const j = parseJsonCookies(clean);
    // JSON 损坏时回退到行解析，至少不直接判死
    parsed = j === null ? parseLines(clean) : j;
  } else {
    parsed = parseLines(clean);
  }

  let droppedDomain = 0;
  let droppedExpired = 0;
  const kept: ParsedCookie[] = [];

  for (const c of parsed) {
    if (!c.name || !c.value) continue;          // 空名/空值跳过
    if (!isNeteaseDomain(c.domain)) { droppedDomain++; continue; }
    if (isExpired(c.expiration)) { droppedExpired++; continue; }
    kept.push(c);
  }

  // 同名 cookie：更具体的 domain 覆盖更泛的
  // 例：music.163.com 的 MUSIC_U 覆盖 .163.com 的 MUSIC_U
  kept.sort((a, b) => (a.domain?.length ?? 0) - (b.domain?.length ?? 0));

  const map = new Map<string, string>();
  for (const c of kept) map.set(c.name, c.value);

  const header = Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  return {
    header,
    total: parsed.length,
    kept: map.size,
    droppedDomain,
    droppedExpired,
    hasMusicU: /(?:^|;\s*)MUSIC_U=/.test(header),
  };
}