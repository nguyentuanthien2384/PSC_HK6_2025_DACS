import { readCatalog } from './catalogRequest';
import axios from '../axios';
import { setAuth } from '../utils/token';

jest.mock('../axios', () => ({ get: jest.fn() }));

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    return { promise, resolve, reject };
};
const tick = () => Promise.resolve();

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

test('simultaneous catalog reads share transport and every later read refreshes inventory', async () => {
    const network = deferred();
    axios.get.mockReturnValueOnce(network.promise).mockResolvedValueOnce({ stock: 1 });
    const first = readCatalog('/stock', { params: { limit: 6, keyword: '' } });
    const second = readCatalog('/stock', { params: { keyword: '', limit: 6 } });
    await tick();
    expect(axios.get).toHaveBeenCalledTimes(1);
    network.resolve({ stock: 2 });
    await expect(first).resolves.toEqual({ stock: 2 });
    await expect(second).resolves.toEqual({ stock: 2 });
    await expect(readCatalog('/stock', { params: { keyword: '', limit: 6 } })).resolves.toEqual({ stock: 1 });
    expect(axios.get).toHaveBeenCalledTimes(2);
});

test('StrictMode cleanup and synchronous remount retain one active transport', async () => {
    const network = deferred();
    axios.get.mockReturnValue(network.promise);
    const controller = new AbortController();
    const old = readCatalog('/strict', { signal: controller.signal });
    const rejected = expect(old).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    controller.abort();
    const current = readCatalog('/strict', { signal: new AbortController().signal });
    await rejected;
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get.mock.calls[0][1].signal.aborted).toBe(false);
    network.resolve({ errCode: 0 });
    await expect(current).resolves.toEqual({ errCode: 0 });
});

test('unmounting the final subscriber aborts its transport while another active subscriber is protected', async () => {
    const network = deferred();
    axios.get.mockReturnValue(network.promise);
    const a = new AbortController();
    const b = new AbortController();
    const first = readCatalog('/abort', { signal: a.signal });
    const second = readCatalog('/abort', { signal: b.signal });
    const firstRejected = expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    const secondRejected = expect(second).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await tick();
    a.abort();
    await firstRejected;
    expect(axios.get.mock.calls[0][1].signal.aborted).toBe(false);
    b.abort();
    await secondRejected;
    await tick();
    expect(axios.get.mock.calls[0][1].signal.aborted).toBe(true);
    network.reject(Object.assign(new Error('Cancelled'), { code: 'ERR_CANCELED' }));
    await tick();
});

test('different filters and different account tokens never share a request', async () => {
    axios.get.mockResolvedValue({ errCode: 0 });
    const a = readCatalog('/scope', { params: { category: 'A' } });
    const b = readCatalog('/scope', { params: { category: 'B' } });
    setAuth('new-account', { id: 2 });
    const c = readCatalog('/scope', { params: { category: 'A' } });
    await Promise.all([a, b, c]);
    expect(axios.get).toHaveBeenCalledTimes(3);
});

test('failed requests can be retried and already cancelled reads never start transport', async () => {
    axios.get.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ errCode: 0 });
    await expect(readCatalog('/retry')).rejects.toThrow('Offline');
    await expect(readCatalog('/retry')).resolves.toEqual({ errCode: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(readCatalog('/never', { signal: controller.signal })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(axios.get).toHaveBeenCalledTimes(2);
});
