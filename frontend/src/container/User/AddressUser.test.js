import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getAllAddressUserByUserIdService, deleteAddressUserService } from '../../services/userService';
import { setDefaultAddressUserService } from '../../services/addressService';
import { toast } from 'react-toastify';
import AddressUser from './AddressUser';

jest.mock('../../services/userService', () => ({
    getAllAddressUserByUserIdService: jest.fn(), createNewAddressUserrService: jest.fn(), deleteAddressUserService: jest.fn(), editAddressUserService: jest.fn(),
}));
jest.mock('../../services/addressService', () => ({ setDefaultAddressUserService: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../ShopCart/AdressUserModal', () => () => null);
const address = (id, isDefault) => ({ id, isDefault, shipName: `Địa chỉ ${id}`, shipPhonenumber: '0901234567', shipEmail: 'buyer@example.com', shipAdress: `Đường ${id}` });
beforeEach(() => jest.clearAllMocks());

test('address preference action updates the persisted default and reloads account addresses', async () => {
    getAllAddressUserByUserIdService.mockResolvedValueOnce({ errCode: 0, data: [address(1, true), address(2, false)] })
        .mockResolvedValue({ errCode: 0, data: [address(2, true), address(1, false)] });
    setDefaultAddressUserService.mockResolvedValue({ errCode: 0 });
    render(<AddressUser id={10} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Đặt làm mặc định' }));
    await waitFor(() => expect(setDefaultAddressUserService).toHaveBeenCalledWith(2));
    await waitFor(() => expect(getAllAddressUserByUserIdService).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText('Mặc định')).toHaveLength(1);
    expect(screen.getByText('Mặc định').parentElement).toHaveTextContent('Địa chỉ 2');
});

test('historical-address deletion reports the server reason and keeps the address visible', async () => {
    getAllAddressUserByUserIdService.mockResolvedValue({ errCode: 0, data: [address(1, true)] });
    deleteAddressUserService.mockResolvedValue({ errCode: 2, errMessage: 'Địa chỉ đã dùng trong đơn hàng.' });
    render(<AddressUser id={10} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Địa chỉ đã dùng trong đơn hàng.'));
    expect(screen.getByText('Địa chỉ 1')).toBeInTheDocument();
    expect(getAllAddressUserByUserIdService).toHaveBeenCalledTimes(1);
});
