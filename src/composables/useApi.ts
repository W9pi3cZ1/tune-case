import { useConfig } from './useConfig';
import { useCookie } from './useCookie';
import { useLog } from './useLog';

type Params = Record<string, string | number | null | undefined>;
interface ApiOpts { omitCookie?: boolean }

export function useApi() {
    const { config } = useConfig();
    const { getCookie } = useCookie();
    const { log } = useLog();

    function apiUrl(path: string, params: Params = {}, opts: ApiOpts = {}): string {
        let base = (config.value.base_url || '').trim();
        if (!base) throw new Error('请先在「配置」中填写 API BaseURL');
        if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
            base = base.replace(/\/+$/, '');

        let url: URL;
        try {
            url = new URL(base + path);
        } catch {
            throw new Error('BaseURL 格式不正确：' + base);
        }

        if (!opts.omitCookie && !params.cookie) {
            const ck = getCookie();
            if (ck) params.cookie = ck;
        }

        url.searchParams.set('timestamp', String(Date.now()));
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        }
        return url.toString();
    }

    async function api<T = any>(
        path: string,
        params: Params = {},
        opts: ApiOpts = {}
    ): Promise<T> {
        const url = apiUrl(path, params, opts);
        log('info', `GET ${path}${opts.omitCookie ? ' (omitCookie)' : ''}`);

        let res: Response;
        try {
            res = await fetch(url, { credentials: 'omit' });
        } catch (e) {
            throw new Error(`请求失败（可能是跨域或网络问题）：${(e as Error).message}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        let data: any;
        try {
            data = await res.json();
        } catch {
            throw new Error('响应不是合法 JSON');
        }
        if (data && data.code && data.code !== 200) {
            log('warn', `${path} 返回 code=${data.code}${data.message ? '（' + data.message + '）' : ''}`);
        }
        return data as T;
    }

    return { api, apiUrl };
}
