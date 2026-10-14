import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManageProductImage from './ManageProductImage';
import * as api from '../../../../services/userService';

let mockId = '8';
jest.mock('react-router-dom', () => ({ useParams: () => ({ id: mockId }) }), { virtual: true });
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../../../services/userService', () => ({
    getAllProductDetailImageByIdService: jest.fn(), getAllProductDetailSizeByIdService: jest.fn(),
    createNewProductImageService: jest.fn(), UpdateProductDetailImageService: jest.fn(), DeleteProductDetailImageService: jest.fn(),
    createNewProductSizeService: jest.fn(), UpdateProductDetailSizeService: jest.fn(), DeleteProductDetailSizeService: jest.fn()
}));
jest.mock('react-image-lightbox', () => props => <div role="dialog" aria-label="Image preview">{props.mainSrc}</div>);
jest.mock('./AddImageModal', () => props => <div role="dialog" aria-label="Image form"><button onClick={props.closeModal}>Close image form</button></div>);
jest.mock('./AddSizeModal', () => props => <div role="dialog" aria-label="Size form"><button onClick={props.closeModal}>Close size form</button></div>);
const image = { id: 4, caption: 'Ảnh áo', image: '/api/media/product-images/4/123/card', previewImage: '/api/media/product-images/4/123/detail' };
const size = { id: 9, sizeData: { value: 'M' }, width: 30, height: 50, weight: 100, stock: 20 };
beforeEach(() => {
    jest.clearAllMocks(); mockId = '8';
    api.getAllProductDetailImageByIdService.mockResolvedValue({ errCode: 0, data: [image], count: 18 });
    api.getAllProductDetailSizeByIdService.mockResolvedValue({ errCode: 0, data: [size], count: 18 });
});

test('image and size lists load once without closed modals and use lazy thumbnails with one full preview', async () => {
    const view = render(<ManageProductImage />);
    const thumbnail = await screen.findByRole('img', { name: 'Ảnh áo' });
    await screen.findByText('M');
    expect(api.getAllProductDetailImageByIdService).toHaveBeenCalledTimes(1);
    expect(api.getAllProductDetailSizeByIdService).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(thumbnail).toHaveAttribute('src', image.image);
    expect(thumbnail).toHaveAttribute('loading', 'lazy');
    expect(thumbnail).toHaveAttribute('decoding', 'async');
    expect(thumbnail).toHaveAttribute('width', '100');
    expect(thumbnail).toHaveAttribute('height', '40');
    expect(screen.getByRole('button', { name: 'Chỉnh sửa hình Ảnh áo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Xóa kích thước M' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem hình Ảnh áo' }));
    expect(await screen.findByRole('dialog', { name: 'Image preview' })).toHaveTextContent(image.previewImage);
    expect(screen.getAllByRole('dialog', { name: 'Image preview' })).toHaveLength(1);
    mockId = '10'; view.rerender(<ManageProductImage />);
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('table').every(table => !table.hasAttribute('inert'))).toBe(true));
});

test('images and sizes keep independent pagination and cancel reads when the variant route changes', async () => {
    const view = render(<ManageProductImage />);
    await screen.findByText('M'); await screen.findByRole('img');
    fireEvent.click(screen.getAllByLabelText('Trang sau')[1]);
    await waitFor(() => expect(api.getAllProductDetailSizeByIdService).toHaveBeenLastCalledWith(expect.objectContaining({ id: '8', offset: 6 })));
    expect(api.getAllProductDetailImageByIdService).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByLabelText('Trang sau')[0]);
    await waitFor(() => expect(api.getAllProductDetailImageByIdService).toHaveBeenLastCalledWith(expect.objectContaining({ id: '8', offset: 6 })));
    const oldImageSignal = api.getAllProductDetailImageByIdService.mock.calls.at(-1)[0].signal;
    const oldSizeSignal = api.getAllProductDetailSizeByIdService.mock.calls.at(-1)[0].signal;
    mockId = '10'; view.rerender(<ManageProductImage />);
    expect(oldImageSignal.aborted).toBe(true); expect(oldSizeSignal.aborted).toBe(true);
    await waitFor(() => expect(api.getAllProductDetailImageByIdService).toHaveBeenLastCalledWith(expect.objectContaining({ id: '10', offset: 0 })));
    expect(api.getAllProductDetailSizeByIdService).toHaveBeenLastCalledWith(expect.objectContaining({ id: '10', offset: 0 }));
    await waitFor(() => expect(screen.getAllByRole('table').every(table => !table.hasAttribute('inert'))).toBe(true));
});

test('editing forms mount only after opening and close when the variant route changes', async () => {
    const view = render(<ManageProductImage />); await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm kích thước' }));
    expect(await screen.findByRole('dialog', { name: 'Size form' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close size form' }));
    expect(screen.queryByRole('dialog', { name: 'Size form' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm hình ảnh' }));
    expect(await screen.findByRole('dialog', { name: 'Image form' })).toBeInTheDocument();
    mockId = '10'; view.rerender(<ManageProductImage />);
    expect(screen.queryByRole('dialog', { name: 'Image form' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('table').every(table => !table.hasAttribute('inert'))).toBe(true));
});
