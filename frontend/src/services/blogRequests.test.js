import axios from '../axios';
import { getAllBlog, getAllcommentByBlogIdService } from './userService';

jest.mock('../axios', () => ({ get: jest.fn() }));
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

test('StrictMode blog cleanup and immediate remount keep one transport', async () => {
    const network = deferred();
    axios.get.mockReturnValue(network.promise);
    const controller = new AbortController();
    const old = getAllBlog({ limit: 6, offset: 0, signal: controller.signal });
    const cancelled = expect(old).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    controller.abort();
    const current = getAllBlog({ limit: 6, offset: 0, signal: new AbortController().signal });
    await cancelled;
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get.mock.calls[0][1].signal.aborted).toBe(false);
    network.resolve({ errCode: 0, data: [] });
    await expect(current).resolves.toMatchObject({ errCode: 0 });
});

test('returning to news requests current articles after the first response has settled', async () => {
    axios.get.mockResolvedValue({ errCode: 0, data: [] });
    await getAllBlog({ limit: 6, offset: 0, keyword: '' });
    await getAllBlog({ limit: 6, offset: 0, keyword: '' });
    expect(axios.get).toHaveBeenCalledTimes(2);
});

test('refreshing comments after a submission bypasses a read started before the mutation', async () => {
    const old = deferred();
    axios.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ errCode: 0, data: ['new comment'] });
    const initial = getAllcommentByBlogIdService(9);
    const refreshed = getAllcommentByBlogIdService(9, { fresh: true });
    await expect(refreshed).resolves.toMatchObject({ data: ['new comment'] });
    expect(axios.get).toHaveBeenCalledTimes(2);
    old.resolve({ errCode: 0, data: [] });
    await initial;
});
