import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { getItemCartStart } from '../../action/ShopCartAction';
import { addShopCartService, deleteItemShopCartService } from '../../services/userService';
import DeleteShopCartModal from '../../container/ShopCart/DeleteShopCartModal';
import CommonUtils from '../../utils/CommonUtils';
function ShopCartItem(props) {
    const [quantity, setquantity] = useState('')
    const [isOpenModal, setisOpenModal] = useState(false)
    const [busy, setBusy] = useState(false)
    const dispatch = useDispatch()
    let handleOnChange = async (event) => {
        if (busy) return;
        const next = event.target.value;
        if (next !== '' && (!Number.isInteger(Number(next)) || Number(next) < 0)) {
            toast.error("Số lượng phải là số nguyên không âm"); return;
        }
        setquantity(event.target.value)

        if (event.target.value === "0") {

            setisOpenModal(true)
        } else {
            if (event.target.value) {
                setBusy(true);
                try {
                let res = await addShopCartService({
                    type: 'UPDATE_QUANTITY',
                    userId: props.userId,
                    productdetailsizeId: props.productdetailsizeId,
                    quantity: event.target.value,
                })
                if (res && res.errCode === 0) {


                    dispatch(getItemCartStart(props.userId))

                } else {
                    toast.error(res.errMessage)
                    setquantity(res.quantity ?? props.quantity)
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
            dispatch(getItemCartStart(props.userId))
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
                        <input type="number" name="qty" value={quantity} disabled={busy} onBlur={() => { if (quantity === '') setquantity(props.quantity); }} step="1"
                            title="Quantity:" className="input-text qty" min="0" onChange={(event) => handleOnChange(event)} />
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
