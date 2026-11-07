import { onMounted, onUnmounted, ref } from 'vue';
import type { TabName } from '../types';

const VALID: TabName[] = ['main', 'settings', 'logs', 'account'];

function readHash(): TabName | null {
    const h = location.hash.slice(1) as TabName;
    return VALID.includes(h) ? h : null;
}

const current = ref<TabName | null>(readHash());

export function useRoute() {
    function go(name: TabName) {
        location.hash = name;
    }
    function sync() {
        current.value = readHash();
    }

    onMounted(() => window.addEventListener('hashchange', sync));
    onUnmounted(() => window.removeEventListener('hashchange', sync));

    return { current, go };
}
