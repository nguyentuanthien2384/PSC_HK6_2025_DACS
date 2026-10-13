import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DetailBlog from './DetailBlog';
import { setAuth } from '../../utils/token';
import { createNewcommentService, getDetailBlogByIdService, getAllcommentByBlogIdService, getAllCategoryBlogService, getFeatureBlog } from '../../services/userService';

let mockBlogId = '1';
jest.mock('react-router-dom', () => ({
    Link: ({ children }) => <span>{children}</span>,
    useParams: () => ({ id: mockBlogId }),
}), { virtual: true });
jest.mock('../../services/userService', () => ({
    createNewcommentService: jest.fn(), getDetailBlogByIdService: jest.fn(),
    getAllcommentByBlogIdService: jest.fn(), getAllCategoryBlogService: jest.fn(), getFeatureBlog: jest.fn(),
}));
jest.mock('../../component/Blog/RightBlog', () => () => null);
jest.mock('../../component/Blog/CommentBlog', () => ({ content }) => <p>{content}</p>);
jest.mock('../../component/Blog/CommentFormBlog', () => ({ handleAddComment }) => <button onClick={() => handleAddComment('Bình luận mới')}>Gửi bình luận</button>);

const blog = title => ({ errCode: 0, data: { title, contentHTML: '<p>Nội dung</p>' } });
const comments = content => ({ errCode: 0, data: [{ id: 1, content, user: { firstName: 'A', lastName: 'B' } }] });
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockBlogId = '1';
    getDetailBlogByIdService.mockResolvedValue(blog('Bài viết đầu'));
    getAllcommentByBlogIdService.mockResolvedValue(comments('Bình luận đầu'));
    getAllCategoryBlogService.mockResolvedValue({ errCode: 0, data: [] });
    getFeatureBlog.mockResolvedValue({ errCode: 0, data: [] });
});

test('navigating to another article cancels old detail/comments and ignores late results', async () => {
    const oldBlog = deferred();
    const oldComments = deferred();
    getDetailBlogByIdService.mockImplementation(id => id === '1' ? oldBlog.promise : Promise.resolve(blog('Bài viết mới')));
    getAllcommentByBlogIdService.mockImplementation(id => id === '1' ? oldComments.promise : Promise.resolve(comments('Bình luận mới')));
    const { rerender } = render(<DetailBlog />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải bài viết');
    const blogSignal = getDetailBlogByIdService.mock.calls[0][1].signal;
    const commentSignal = getAllcommentByBlogIdService.mock.calls[0][1].signal;
    mockBlogId = '2';
    rerender(<DetailBlog />);
    await screen.findByText('Bài viết mới');
    await screen.findByText('Bình luận mới');
    expect(blogSignal.aborted).toBe(true);
    expect(commentSignal.aborted).toBe(true);
    await act(async () => { oldBlog.resolve(blog('Bài viết lỗi thời')); oldComments.resolve(comments('Bình luận lỗi thời')); });
    expect(screen.queryByText('Bài viết lỗi thời')).not.toBeInTheDocument();
    expect(screen.queryByText('Bình luận lỗi thời')).not.toBeInTheDocument();
    // Sidebar reads are independent of the article id.
    expect(getFeatureBlog).toHaveBeenCalledTimes(1);
});

test('a comment completed after navigating away cannot refresh the new article with old comments', async () => {
    setAuth('token', { id: 4, roleId: 'R2' });
    const submission = deferred();
    createNewcommentService.mockReturnValue(submission.promise);
    const { rerender } = render(<DetailBlog />);
    await screen.findByText('Bài viết đầu');
    fireEvent.click(screen.getByText('Gửi bình luận'));
    getDetailBlogByIdService.mockResolvedValue(blog('Bài viết thứ hai'));
    getAllcommentByBlogIdService.mockResolvedValue(comments('Bình luận thứ hai'));
    mockBlogId = '2';
    rerender(<DetailBlog />);
    await screen.findByText('Bình luận thứ hai');
    const reads = getAllcommentByBlogIdService.mock.calls.length;
    await act(async () => submission.resolve({ errCode: 0 }));
    expect(getAllcommentByBlogIdService).toHaveBeenCalledTimes(reads);
    expect(screen.getByText('Bình luận thứ hai')).toBeInTheDocument();
});

test('failed article loading offers a working retry instead of an empty article', async () => {
    getDetailBlogByIdService.mockRejectedValueOnce(new Error('Máy chủ quá tải'));
    render(<DetailBlog />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ quá tải');
    fireEvent.click(screen.getByText('Thử lại'));
    await screen.findByText('Bài viết đầu');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
