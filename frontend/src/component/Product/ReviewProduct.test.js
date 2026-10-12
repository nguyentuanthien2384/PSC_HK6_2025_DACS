import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createNewReviewService, getAllReviewByProductIdService } from '../../services/userService';
import { toast } from 'react-toastify';
import ReviewProduct from './ReviewProduct';

jest.mock('react-router', () => ({ useParams: () => ({ id: '10' }) }));
jest.mock('../../utils/token', () => ({ getUser: () => ({ id: 1, roleId: 'R2' }) }));
jest.mock('../../utils/CommonUtils', () => ({ getBase64: jest.fn() }));
jest.mock('../../services/userService', () => ({
    createNewReviewService: jest.fn(), getAllReviewByProductIdService: jest.fn(), ReplyReviewService: jest.fn(), deleteReviewService: jest.fn(),
}));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('react-image-lightbox', () => () => null);
jest.mock('./ReviewModal', () => () => null);

const allowed = { canReview: true, message: 'Bạn đã nhận sản phẩm và có thể viết đánh giá.' };
const response = eligibility => ({ errCode: 0, data: [], reviewEligibility: eligibility });
beforeEach(() => {
    jest.clearAllMocks();
    getAllReviewByProductIdService.mockResolvedValue(response(allowed));
});

test.each([
    { canReview: false, reason: 'DELIVERED_PURCHASE_REQUIRED', message: 'Bạn chỉ có thể đánh giá sau khi đơn hàng được giao thành công.' },
    { canReview: false, reason: 'ALREADY_REVIEWED', message: 'Bạn đã đánh giá sản phẩm này.' },
])('review form uses server eligibility and explains a blocked review: $reason', async eligibility => {
    getAllReviewByProductIdService.mockResolvedValue(response(eligibility));
    render(<ReviewProduct />);
    expect(await screen.findByText(eligibility.message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).not.toBeInTheDocument();
    expect(createNewReviewService).not.toHaveBeenCalled();
});

test('eligible customers choose stars, submit one review and see duplicate prevention after success', async () => {
    getAllReviewByProductIdService.mockResolvedValueOnce(response(allowed)).mockResolvedValue(response({ canReview: false, message: 'Bạn đã đánh giá sản phẩm này.' }));
    let resolveSubmission;
    createNewReviewService.mockImplementation(() => new Promise(resolve => { resolveSubmission = resolve; }));
    render(<ReviewProduct />);
    const submit = await screen.findByRole('button', { name: 'Gửi đánh giá' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nội dung đánh giá' }), { target: { value: 'Rất tốt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đánh giá 5 sao' }));
    fireEvent.click(submit);
    expect(screen.getByRole('button', { name: 'Đang gửi...' })).toBeDisabled();
    expect(createNewReviewService).toHaveBeenCalledTimes(1);
    expect(createNewReviewService).toHaveBeenCalledWith({ productId: '10', userId: 1, content: 'Rất tốt', image: '', star: 5 });
    resolveSubmission({ errCode: 0 });
    expect(await screen.findByText('Bạn đã đánh giá sản phẩm này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).not.toBeInTheDocument();
});

test('missing stars and whitespace comments are rejected without sending an API request', async () => {
    render(<ReviewProduct />);
    const submit = await screen.findByRole('button', { name: 'Gửi đánh giá' });
    fireEvent.click(submit);
    expect(toast.error).toHaveBeenCalledWith('Bạn chưa chọn sao !');
    fireEvent.click(screen.getByRole('button', { name: 'Đánh giá 4 sao' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nội dung đánh giá' }), { target: { value: '  ' } });
    fireEvent.click(submit);
    expect(createNewReviewService).not.toHaveBeenCalled();
});

test('server eligibility rejection refreshes guidance and hides the stale form', async () => {
    createNewReviewService.mockResolvedValue({ errCode: 2, errMessage: 'Đơn hàng chưa giao.', reviewEligibility: { canReview: false, message: 'Đơn hàng chưa giao.' } });
    render(<ReviewProduct />);
    const submit = await screen.findByRole('button', { name: 'Gửi đánh giá' });
    fireEvent.click(screen.getByRole('button', { name: 'Đánh giá 5 sao' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nội dung đánh giá' }), { target: { value: 'Tốt' } });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Đơn hàng chưa giao.'));
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).not.toBeInTheDocument();
});
