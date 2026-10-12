import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { getItemCartStart } from '../../action/ShopCartAction';
import { addShopCartService, deleteItemShopCartService } from '../../services/userService';
import DeleteShopCartModal from '../../container/ShopCart/DeleteShopCartModal';
import CommonUtils from '../../utils/CommonUtils';
function ShopCartItem(props) {
    const [quantity, setquantity] = useState(props.quantity)
    const [isOpenModal, setisOpenModal] = useState(false)
    const [busy, setBusy] = useState(false)
    const dispatch = useDispatch()
    useEffect(() => {
        props.onEditingChange?.(props.id, busy || isOpenModal || String(quantity) !== String(props.quantity));
    }, [props.id, props.onEditingChange, props.quantity, quantity, busy, isOpenModal]);
    useEffect(() => () => props.onEditingChange?.(props.id, false), [props.id, props.onEditingChange]);
    const handleOnChange = event => setquantity(event.target.value);
    let commitQuantity = async () => {
        if (busy) return;
        const next = String(quantity);
        if (next !== '' && (!Number.isInteger(Number(next)) || Number(next) < 0)) {
            toast.error("Số lượng phải là số nguyên không âm"); setquantity(props.quantity); return;
        }
        if (next === '') { setquantity(props.quantity); return; }
        if (Number(next) === Number(props.quantity)) return;
        if (next === "0") {

            setisOpenModal(true)
        } else {
            if (next) {
                if (props.stock !== undefined && Number(next) > Number(props.stock)) {
                    toast.error(`Chỉ còn ${props.stock} sản phẩm`); setquantity(props.quantity); return;
                }
                setBusy(true);
                try {
                let res = await addShopCartService({
                    type: 'UPDATE_QUANTITY',
                    userId: props.userId,
                    productdetailsizeId: props.productdetailsizeId,
                    quantity: Number(next),
                })
                if (res && res.errCode === 0) {


                    dispatch(getItemCartStart(props.userId))

                } else {
                    toast.error(res?.errMessage || 'Không thể cập nhật giỏ hàng.')
                    setquantity(props.quantity)
                    await dispatch(getItemCartStart(props.userId))
                }
                } catch (error) { toast.error(error.message); setquantity(props.quantity); }
                finally { setBusy(false); }
            }

        }

    }
    useEffect(() => {
        setquantity(props.quantity)
    }, [props.quantity])
    let closeModal = () => {
        setisOpenModal(false)
        setquantity(props.quantity)
    }
    let handleDeleteShopCart = async () => {
        if (busy) return;
        setBusy(true);
        try {
        let res = await deleteItemShopCartService({
            data: {
                id: props.id
            }
        })
        if (res && res.errCode === 0) {
                    await dispatch(getItemCartStart(props.userId))
            setisOpenModal(false)
        } else {
            toast.error(res.errMessage)
        }
        } catch (error) { toast.error(error.message); }
        finally { setBusy(false); }
    }
    return (
        <tr>

            <td>
                <div className="media">
                    <div className="d-flex">
                        <img style={{ width: '147px', height: '100px', objectFit: 'cover' }} src={props.image} alt="" />
                    </div>
                    <div className="media-body">
                        <p className="text-justify">{props.name} </p>
                        {props.availabilityError && <p role="alert" style={{ color: '#b91c1c' }}>{props.availabilityError}</p>}
                        {!props.isOrder && !props.availabilityError && props.stock !== undefined && <small>Còn {props.stock} sản phẩm</small>}
                    </div>
                </div>
            </td>
            <td>
                <h5 >{CommonUtils.formatter.format(props.price)}</h5>
            </td>
            <td style={{ textAlign: 'center' }}>
                {props.isOrder === true ? <span>{quantity}</span>
                    :
                    <div className="product_count">
                        <input aria-label={`Số lượng ${props.name}`} type="number" name="qty" value={quantity} disabled={busy || props.available === false} onBlur={commitQuantity} step="1"
                            title="Số lượng" className="input-text qty" min="0" max={props.stock} onChange={handleOnChange}
                            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                    </div>
                }

            </td>
            <td style={{ textAlign: 'center' }}>
                <h5 style={{ color: '#71cd14' }}>{CommonUtils.formatter.format(quantity * props.price)}</h5>
            </td>
            {props.isOrder === false &&
                <>
                    <td className="link-delete" onClick={() => setisOpenModal(true)}>Xóa</td>
                    <DeleteShopCartModal handleDeleteShopCart={handleDeleteShopCart} name={props.name} isOpenModal={isOpenModal}
                        closeModal={closeModal} />
                </>

            }

        </tr>
    );
}

export default ShopCartItem;
