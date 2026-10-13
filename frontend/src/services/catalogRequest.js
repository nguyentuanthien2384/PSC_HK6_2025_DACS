import axios from '../axios';
import { getToken } from '../utils/token';

const pending = new Map();
const cancelled = () => Object.assign(new Error('Request cancelled'), { name: 'AbortError', code: 'ERR_CANCELED' });

// Share only requests that are still running, scoped to the current account.
// A later visit always fetches current data; mutations can bypass older reads.
export function readRequest(url, { params = {}, signal, fresh = false } = {}) {
    if (signal?.aborted) return Promise.reject(cancelled());
    const key = JSON.stringify([url, getToken(), Object.entries(params).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))]);
    let entry = fresh ? undefined : pending.get(key);
    if (!entry) {
        const controller = new AbortController();
        entry = { controller, subscribers: new Set() };
        pending.set(key, entry);
        entry.request = Promise.resolve().then(() => axios.get(url, { params, signal: controller.signal }));
        entry.request.then(() => {
            if (pending.get(key) === entry) pending.delete(key);
        }, () => {
            if (pending.get(key) === entry) pending.delete(key);
        });
    }
    return new Promise((resolve, reject) => {
        const subscriber = {};
        entry.subscribers.add(subscriber);
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            entry.subscribers.delete(subscriber);
            callback(value);
        };
        const onAbort = () => {
            finish(reject, cancelled());
            // StrictMode remounts synchronously: let the new subscriber keep the request alive.
            Promise.resolve().then(() => {
                if (!entry.subscribers.size) {
                    if (pending.get(key) === entry) pending.delete(key);
                    entry.controller.abort();
                }
            });
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        entry.request.then((value) => finish(resolve, value), (error) => finish(reject, error));
    });
}

export const readCatalog = readRequest;
