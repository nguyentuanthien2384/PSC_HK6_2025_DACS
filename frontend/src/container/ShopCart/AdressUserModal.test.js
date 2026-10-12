import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDetailAddressUserByIdService } from '../../services/userService';
import AddressUsersModal from './AdressUserModal';

jest.mock('../../services/userService', () => ({ getDetailAddressUserByIdService: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('reactstrap', () => ({
    Modal: ({ isOpen, children }) => isOpen ? <div>{children}</div> : null,
    ModalBody: ({ children }) => <div>{children}</div>, ModalFooter: ({ children }) => <div>{children}</div>,
    Button: ({ color, ...props }) => <button {...props} />,
}));
const values = { shipName: 'Người nhận', shipAdress: '123 Đường A', shipEmail: 'buyer@example.com', shipPhonenumber: '0901234567' };
beforeEach(() => jest.clearAllMocks());
const fill = () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Họ và tên' }), { target: { value: values.shipName } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Địa chỉ cụ thể' }), { target: { value: values.shipAdress } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: values.shipEmail } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), { target: { value: values.shipPhonenumber } });
};

test('new-address form sends default preference and preserves entries after a failed save', async () => {
    const save = jest.fn().mockResolvedValue(false);
    render(<AddressUsersModal isOpenModal sendDataFromModalAddress={save} closeModaAddressUser={jest.fn()} />);
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Đặt làm địa chỉ mặc định' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ ...values, isDefault: true, isActionUpdate: false })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu thông tin' })).toBeEnabled());
    expect(screen.getByRole('textbox', { name: 'Họ và tên' })).toHaveValue('Người nhận');
});

test('switching from edit to new resets fields and action state instead of editing the previous address', async () => {
    getDetailAddressUserByIdService.mockResolvedValue({ errCode: 0, data: { id: 5, ...values, isDefault: true } });
    const save = jest.fn().mockResolvedValue(true);
    const props = { sendDataFromModalAddress: save, closeModaAddressUser: jest.fn() };
    const { rerender } = render(<AddressUsersModal {...props} isOpenModal addressUserId={5} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Họ và tên' })).toHaveValue('Người nhận'));
    rerender(<AddressUsersModal {...props} isOpenModal={false} addressUserId="" />);
    rerender(<AddressUsersModal {...props} isOpenModal addressUserId="" />);
    expect(screen.getByRole('textbox', { name: 'Họ và tên' })).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Đặt làm địa chỉ mặc định' })).not.toBeChecked();
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: '', isActionUpdate: false, isDefault: false })));
});

test('failed detail loading cannot turn an edit action into an accidental new address', async () => {
    getDetailAddressUserByIdService.mockRejectedValue(new Error('Địa chỉ không tồn tại.'));
    const save = jest.fn();
    render(<AddressUsersModal isOpenModal addressUserId={5} sendDataFromModalAddress={save} closeModaAddressUser={jest.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Địa chỉ không tồn tại.');
    expect(screen.getByRole('button', { name: 'Lưu thông tin' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
});
