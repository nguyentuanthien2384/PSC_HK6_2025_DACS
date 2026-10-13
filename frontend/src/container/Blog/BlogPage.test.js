import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BlogPage from './BlogPage';
import { getAllBlog, getAllCategoryBlogService, getFeatureBlog } from '../../services/userService';

jest.mock('../../services/userService', () => ({ getAllBlog: jest.fn(), getAllCategoryBlogService: jest.fn(), getFeatureBlog: jest.fn() }));
jest.mock('react-router-dom', () => ({ Link: ({ children }) => <span>{children}</span> }), { virtual: true });
jest.mock('../../component/Blog/ItemBlog', () => ({ data }) => <article>{data.title}</article>);
jest.mock('../../component/Blog/RightBlog', () => props => <div>
    <button onClick={() => props.handleClickCategory('OLD')}>Danh mục cũ</button>
    <button onClick={() => props.handleClickCategory('NEW')}>Danh mục mới</button>
    <button onClick={() => props.handleSearchBlog('  áo  ')}>Tìm áo</button>
    <button onClick={() => props.handleOnchangeSearch('')}>Xóa tìm kiếm</button>
</div>);
jest.mock('react-paginate', () => ({ forcePage, disableInitialCallback, onPageChange }) => {
    require('react').useEffect(() => { if (!disableInitialCallback) onPageChange({ selected: 0 }); }, []);
    return <div><span data-testid="page">{forcePage + 1}</span><button onClick={() => onPageChange({ selected: 1 })}>Trang 2</button></div>;
});

const response = title => ({ errCode: 0, count: 30, data: [{ id: 1, title }] });
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
beforeEach(() => {
    jest.clearAllMocks();
    getAllBlog.mockResolvedValue(response('Bài viết hiện tại'));
    getAllCategoryBlogService.mockResolvedValue({ errCode: 0, data: [] });
    getFeatureBlog.mockResolvedValue({ errCode: 0, data: [] });
});

test('opening news uses one initial list request and keeps results visible during pagination', async () => {
    render(<BlogPage />);
    await screen.findByText('Bài viết hiện tại');
    expect(getAllBlog).toHaveBeenCalledTimes(1);
    const network = deferred();
    getAllBlog.mockReturnValueOnce(network.promise);
    fireEvent.click(screen.getByText('Trang 2'));
    expect(screen.getByText('Bài viết hiện tại')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải bài viết');
    await act(async () => network.resolve(response('Bài viết trang 2')));
    expect(screen.getByText('Bài viết trang 2')).toBeInTheDocument();
    expect(getAllBlog).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 6 }));
});

test('changing categories from page two cancels the previous request and ignores its late response', async () => {
    render(<BlogPage />);
    await screen.findByText('Bài viết hiện tại');
    fireEvent.click(screen.getByText('Trang 2'));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('2'));
    const old = deferred();
    getAllBlog.mockImplementation(({ subjectId }) => subjectId === 'OLD' ? old.promise : Promise.resolve(response('Bài viết mới')));
    fireEvent.click(screen.getByText('Danh mục cũ'));
    const oldSignal = getAllBlog.mock.calls.at(-1)[0].signal;
    fireEvent.click(screen.getByText('Danh mục mới'));
    await screen.findByText('Bài viết mới');
    expect(oldSignal.aborted).toBe(true);
    expect(getAllBlog).toHaveBeenLastCalledWith(expect.objectContaining({ subjectId: 'NEW', offset: 0 }));
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    await act(async () => old.resolve(response('Bài viết lỗi thời')));
    expect(screen.queryByText('Bài viết lỗi thời')).not.toBeInTheDocument();
});

test('searching and clearing search retain the selected category and restart at page one', async () => {
    render(<BlogPage />);
    await screen.findByText('Bài viết hiện tại');
    fireEvent.click(screen.getByText('Danh mục mới'));
    fireEvent.click(screen.getByText('Trang 2'));
    fireEvent.click(screen.getByText('Tìm áo'));
    await waitFor(() => expect(getAllBlog).toHaveBeenLastCalledWith(expect.objectContaining({ subjectId: 'NEW', keyword: 'áo', offset: 0 })));
    fireEvent.click(screen.getByText('Xóa tìm kiếm'));
    await waitFor(() => expect(getAllBlog).toHaveBeenLastCalledWith(expect.objectContaining({ subjectId: 'NEW', keyword: '', offset: 0 })));
});

test('an offline list request offers a retry without an unhandled rejection', async () => {
    getAllBlog.mockRejectedValueOnce(new Error('Mất kết nối'));
    render(<BlogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    fireEvent.click(screen.getByText('Thử lại'));
    await screen.findByText('Bài viết hiện tại');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
