import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ShipperRating } from './OrderForms';
import { rateShipper } from '../../services/shippingService';

jest.mock('../../services/shippingService', () => ({ rateShipper: jest.fn() }));

test('navigating to a different order does not show a late review response from the previous order', async () => {
    let resolvePrevious;
    rateShipper.mockReturnValueOnce(new Promise(resolve => { resolvePrevious = resolve; }));
    const onRated = jest.fn();
    const { rerender } = render(<ShipperRating order={{ id: 1, shipperData: { firstName: 'An' } }} allowSubmit onRated={onRated} />);
    fireEvent.click(screen.getByRole('radio', { name: '5 sao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    rerender(<ShipperRating order={{ id: 2, shipperData: { firstName: 'Bình' } }} allowSubmit onRated={onRated} />);
    await act(async () => resolvePrevious({ errCode: 0, data: { rating: 5, comment: 'Đánh giá đơn trước' } }));
    expect(screen.getByRole('heading', { name: 'Đánh giá Bình' })).toBeInTheDocument();
    expect(screen.queryByText('Đánh giá đơn trước')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi đánh giá' })).toBeDisabled();
    expect(onRated).not.toHaveBeenCalled();
});
