import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import DetailProductPage from './DetailProductPage';
import { getDetailProductByIdService } from '../../services/userService';

jest.mock('react-router-dom', () => ({ useParams: jest.fn(), Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('../../services/userService', () => ({ getDetailProductByIdService: jest.fn(), getProductRecommendService: jest.fn() }));
jest.mock('../../component/Product/InfoDetailProduct', () => ({ dataProduct }) => <h1>{dataProduct.name}</h1>);
jest.mock('../../component/Product/DescriptionProduct', () => () => null);
jest.mock('../../component/Product/ProfileProduct', () => () => null);
jest.mock('../../component/Product/ReviewProduct', () => () => null);
jest.mock('../../component/HomeFeature/ProductFeature', () => () => null);

test('moving between products clears the previous product immediately and ignores an obsolete detail request', async () => {
    localStorage.clear();
    const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    let finishSecond;
    getDetailProductByIdService.mockResolvedValueOnce({ errCode: 0, data: { id: 1, name: 'Sản phẩm A' } })
        .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }))
        .mockResolvedValueOnce({ errCode: 0, data: { id: 3, name: 'Sản phẩm C' } });
    useParams.mockReturnValue({ id: '1' });
    const { rerender } = render(<DetailProductPage />);
    await screen.findByRole('heading', { name: 'Sản phẩm A' });
    useParams.mockReturnValue({ id: '2' });
    rerender(<DetailProductPage />);
    expect(screen.queryByRole('heading', { name: 'Sản phẩm A' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thông tin sản phẩm');
    const secondSignal = getDetailProductByIdService.mock.calls[1][1].signal;
    useParams.mockReturnValue({ id: '3' });
    rerender(<DetailProductPage />);
    await screen.findByRole('heading', { name: 'Sản phẩm C' });
    expect(secondSignal.aborted).toBe(true);
    await act(async () => finishSecond({ errCode: 0, data: { id: 2, name: 'Sản phẩm B' } }));
    expect(screen.queryByRole('heading', { name: 'Sản phẩm B' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sản phẩm C' })).toBeInTheDocument();
    scroll.mockRestore();
});
