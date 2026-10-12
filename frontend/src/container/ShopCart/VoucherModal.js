import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { Modal, ModalFooter, ModalBody, Button } from 'reactstrap';
import '../User/StoreVoucher.scss';
import { getAllVoucherByUserIdService } from '../../services/userService';
import CommonUtils from '../../utils/CommonUtils';
import { voucherAvailabilityError } from '../../utils/voucher';
import { ChooseVoucherStart } from '../../action/ShopCartAction';
import VoucherItemSmall from '../User/VoucherItemSmall';

const VoucherModal = props => {
    const dispatch = useDispatch();
    const [codeVoucher, setCodeVoucher] = useState('');
    const [dataVoucher, setDataVoucher] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!props.isOpenModal || !props.id) return;
        let active = true;
        setLoading(true);
        setError('');
        setCodeVoucher('');
        getAllVoucherByUserIdService({ limit: '', offset: '', id: props.id }).then(response => {
            if (!active) return;
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải voucher.');
            setDataVoucher(response.data || []);
        }).catch(reason => {
            if (active) { setError(reason.message); setDataVoucher([]); }
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [props.isOpenModal, props.id]);

    const applyCode = () => {
        const entry = dataVoucher.find(item => item.voucherData?.codeVoucher?.toLowerCase() === codeVoucher.trim().toLowerCase());
        if (!entry) { toast.error('Mã này chưa có trong voucher đã lưu của bạn.'); return; }
        const issue = voucherAvailabilityError(entry, props.price);
        if (issue) { toast.error(issue); return; }
        dispatch(ChooseVoucherStart(entry));
        props.closeModalFromVoucherItem();
    };
    const removeVoucher = () => {
        dispatch(ChooseVoucherStart({}));
        props.closeModalFromVoucherItem();
    };

    return <Modal isOpen={props.isOpenModal} className="booking-modal-container" size="md" centered>
        <div className="modal-header">
            <h5 className="modal-title">Chọn voucher</h5>
            <button onClick={props.closeModal} type="button" className="btn btn-time" aria-label="Đóng">X</button>
        </div>
        <ModalBody>
            <label htmlFor="saved-voucher-code">Mã voucher đã lưu</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input id="saved-voucher-code" className="form-control" value={codeVoucher} onChange={event => setCodeVoucher(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter' && !loading) applyCode(); }} />
                <Button disabled={loading || !codeVoucher.trim()} onClick={applyCode}>Áp dụng</Button>
            </div>
            {loading && <p role="status">Đang tải voucher...</p>}
            {error && <p role="alert">{error}</p>}
            {!loading && !error && !dataVoucher.length && <p>Bạn chưa có voucher còn hiệu lực. Hãy lưu voucher tại mục Voucher trước khi áp dụng.</p>}
            <div style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'hidden' }} className="container-voucher">
                {!loading && dataVoucher.map(item => {
                    const voucher = item.voucherData;
                    const rule = voucher.typeVoucherOfVoucherData;
                    const issue = voucherAvailabilityError(item, props.price);
                    const discount = rule.typeVoucher === 'percent' ? `${rule.value}%` : CommonUtils.formatter.format(rule.maxValue || rule.value);
                    return <VoucherItemSmall key={item.id} data={item} id={item.id} name={voucher.codeVoucher}
                        maxValue={CommonUtils.formatter.format(rule.maxValue || rule.value)} typeVoucher={discount}
                        usedAmount={Math.round(Number(voucher.usedAmount || 0) * 100 / Number(voucher.amount || 1))}
                        disabled={!!issue} eligibilityMessage={issue} closeModalFromVoucherItem={props.closeModalFromVoucherItem} />;
                })}
            </div>
        </ModalBody>
        <ModalFooter>
            <Button onClick={removeVoucher}>Không dùng voucher</Button>
            <Button onClick={props.closeModal}>Đóng</Button>
        </ModalFooter>
    </Modal>;
};
export default VoucherModal;
