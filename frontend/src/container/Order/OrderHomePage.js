import { getUser } from "../../utils/token";
import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import {
    getAllAddressUserByUserIdService,
    createNewAddressUserrService,
    getAllTypeShip,
    createNewOrderService,
    paymentOrderService,
} from "../../services/userService";
import "./OrderHomePage.scss";
import AddressUsersModal from "../ShopCart/AdressUserModal";
import {
    ChooseTypeShipStart,
    ChooseVoucherStart,
    getItemCartStart,
} from "../../action/ShopCartAction";
import { toast } from "react-toastify";
import storeVoucherLogo from "../../../src/resources/img/storeVoucher.png";
import ShopCartItem from "../../component/ShopCart/ShopCartItem";
import VoucherModal from "../ShopCart/VoucherModal";
import CommonUtils from "../../utils/CommonUtils";
import { cartSubtotal, createCheckoutPayload, discountedSubtotal } from "../../utils/checkout";
function OrderHomePage(props) {
    const dispatch = useDispatch();
    const [dataAddressUser, setdataAddressUser] = useState([]);
    const userId = getUser()?.id;
    const navigate = useNavigate();
    const [addressUserId, setaddressUserId] = useState("");

    const [priceShip, setpriceShip] = useState(0);
    let price = 0;
    const [submitting, setSubmitting] = useState(false);
    const [stt, setstt] = useState(0);
    let dataCart = useSelector((state) => state.shopcart.listCartItem);
    let dataVoucher = useSelector((state) => state.shopcart.dataVoucher);
    let dataTypeShip = useSelector((state) => state.shopcart.dataTypeShip);
    const [isChangeAdress, setisChangeAdress] = useState(false);
    const [isOpenModalAddressUser, setisOpenModalAddressUser] = useState(false);
    const [isOpenModal, setisOpenModal] = useState(false);
    const [typeShip, settypeShip] = useState([]);
    const [activeTypePayment, setactiveTypePayment] = useState(0);
    const [activeTypeOnlPayment, setactiveTypeOnlPayment] = useState(1);
    const [note, setnote] = useState("");
    useEffect(() => {
        dispatch(getItemCartStart(userId));
        let fetchDataAddress = async () => {
            await loadDataAddress(userId);
        };
        fetchDataAddress().catch((error) => toast.error(error.message));
        let fetchTypeShip = async () => {
            let res = await getAllTypeShip({
                limit: "",
                offset: "",
                keyword: "",
            });
            if (res && res.errCode === 0) {
                settypeShip(res.data || []);
                const selected = res.data?.find((ship) => ship.id === dataTypeShip?.id);
                if (selected) {
                    dispatch(ChooseTypeShipStart(selected));
                    setpriceShip(Number(selected.price));
                } else {
                    dispatch(ChooseTypeShipStart({}));
                    setpriceShip(0);
                }
            }
        };
        fetchTypeShip().catch((error) => toast.error(error.message));
        if (dataTypeShip && dataTypeShip.price) {
            setpriceShip(Number(dataTypeShip.price));
        }
    }, []);

    let loadDataAddress = async (userId) => {
        let res = await getAllAddressUserByUserIdService(userId);
        if (res && res.errCode === 0) {
            setdataAddressUser(res.data || []);
            setaddressUserId(res.data?.[0]?.id || "");
            setstt(0);
            if (!res.data?.length) setisChangeAdress(true);
        } else {
            throw new Error(res.errMessage || "Không thể tải địa chỉ nhận hàng");
        }
    };
    let closeModaAddressUser = () => {
        setisOpenModalAddressUser(false);
    };
    let handleOpenAddressUserModal = async () => {
        setisOpenModalAddressUser(true);
    };
    let sendDataFromModalAddress = async (data) => {
        setisOpenModalAddressUser(false);

        try {
        let res = await createNewAddressUserrService({
            shipName: data.shipName,
            shipAdress: data.shipAdress,
            shipEmail: data.shipEmail,
            shipPhonenumber: data.shipPhonenumber,
            userId: userId,
        });
        if (res && res.errCode === 0) {
            toast.success("Thêm địa chỉ thành công !");
            await loadDataAddress(userId);
        } else {
            toast.error(res.errMessage);
        }
        } catch (error) { toast.error(error.message); }
    };
    let handleOnChange = (id, index) => {
        setaddressUserId(id);
        setstt(index);
    };
    let handleOpenModal = () => {
        setisOpenModal(true);
    };
    let closeModal = () => {
        setisOpenModal(false);
    };
    let closeModalFromVoucherItem = () => {
        setisOpenModal(false);
    };
    const totalPriceDiscount = discountedSubtotal;
    let handleChooseTypeShip = (item) => {
        dispatch(ChooseTypeShipStart(item));
        setpriceShip(Number(item.price));
    };

    const handleSaveOrder = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const checkout = createCheckoutPayload({ userId, addressUserId, dataTypeShip, dataVoucher, note, dataCart });
            if (activeTypePayment === 0) {
                const result = await createNewOrderService(checkout);
                if (result.errCode !== 0) throw new Error(result.errMessage || "Không thể đặt hàng");
                dispatch(getItemCartStart(userId));
                dispatch(ChooseVoucherStart({}));
                toast.success("Đặt hàng thành công");
                navigate(`/user/order/${userId}`);
            } else if (activeTypeOnlPayment === 1) {
                const result = await paymentOrderService(checkout);
                if (result.errCode !== 0 || !result.link) throw new Error(result.errMessage || "Không thể khởi tạo thanh toán PayPal");
                localStorage.setItem("orderData", JSON.stringify({ ...checkout, checkoutToken: result.checkoutToken }));
                window.location.href = result.link;
            } else {
                navigate("/payment/vnpay", { state: { orderData: { ...checkout,
                    total: discountedSubtotal(cartSubtotal(dataCart), dataVoucher) + Number(dataTypeShip?.price || 0) } } });
            }
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSubmitting(false);
        }
    };
    return (
        <>
            <div className="wrap-order">
                <div className="wrap-heading-order">
                    <NavLink to="/" className="navbar-brand logo_h">
                        <img src="/resources/img/logo.png" alt="" />
                    </NavLink>
                    <span>Thanh Toán</span>
                </div>
                <div className="wrap-address-order">
                    <div className="border-top-address-order"></div>
                    <div className="wrap-content-address">
                        <div className="content-up">
                            <div className="content-left">
                                <i className="fas fa-map-marker-alt"></i>
                                <span>Địa Chỉ Nhận Hàng</span>
                            </div>
                            {isChangeAdress === true && (
                                <div className="content-right">
                                    <div className="wrap-add-address">
                                        <i className="fas fa-plus"></i>
                                        <span
                                            onClick={() =>
                                                handleOpenAddressUserModal()
                                            }
                                        >
                                            Thêm địa chỉ mới
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="content-down">
                            {isChangeAdress === false ? (
                                <>
                                    <div className="content-left">
                                        <span>
                                            {dataAddressUser &&
                                                dataAddressUser.length > 0 &&
                                                dataAddressUser[stt]
                                                    .shipName}{" "}
                                            (
                                            {dataAddressUser &&
                                                dataAddressUser.length > 0 &&
                                                dataAddressUser[stt]
                                                    .shipPhonenumber}
                                            )
                                        </span>
                                    </div>
                                    <div className="content-center">
                                        <span>
                                            {dataAddressUser &&
                                                dataAddressUser.length > 0 &&
                                                dataAddressUser[stt].shipAdress}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div>
                                    {dataAddressUser &&
                                        dataAddressUser.length > 0 &&
                                        dataAddressUser.map((item, index) => {
                                            return (
                                                <div
                                                    key={index}
                                                    className="form-check "
                                                >
                                                    <input
                                                        className="form-check-input"
                                                        checked={
                                                            item.id ===
                                                            addressUserId
                                                                ? true
                                                                : false
                                                        }
                                                        onChange={() =>
                                                            handleOnChange(
                                                                item.id,
                                                                index
                                                            )
                                                        }
                                                        type="radio"
                                                        name="addressRadios"
                                                        id={`addressRadios${index}`}
                                                    />
                                                    <label
                                                        className="form-check-label wrap-radio-address"
                                                        for={`addressRadios${index}`}
                                                    >
                                                        <div className="content-left">
                                                            <span>
                                                                {item.shipName}{" "}
                                                                (
                                                                {
                                                                    item.shipPhonenumber
                                                                }
                                                                )
                                                            </span>
                                                        </div>
                                                        <div className="content-center">
                                                            <span>
                                                                {
                                                                    item.shipAdress
                                                                }
                                                            </span>
                                                        </div>
                                                    </label>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}

                            <div className="content-right">
                                <span className="text-default">Mặc định</span>
                                {isChangeAdress === false && (
                                    <span
                                        onClick={() => setisChangeAdress(true)}
                                        className="text-change"
                                    >
                                        Thay đổi
                                    </span>
                                )}
                            </div>
                        </div>
                        {isChangeAdress === true && (
                            <div className="box-action">
                                <div
                                    onClick={() => setisChangeAdress(false)}
                                    className="wrap-back"
                                >
                                    <span>Trở về</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="wrap-order-item">
                    <section className="cart_area">
                        <div className="container">
                            <div className="cart_inner">
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th scope="col">Sản phẩm</th>
                                                <th scope="col">Giá</th>
                                                <th
                                                    style={{
                                                        textAlign: "center",
                                                    }}
                                                    scope="col"
                                                >
                                                    Số lượng
                                                </th>
                                                <th
                                                    style={{
                                                        textAlign: "center",
                                                    }}
                                                    scope="col"
                                                >
                                                    Tổng tiền
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataCart &&
                                                dataCart.length > 0 &&
                                                dataCart.map((item, index) => {
                                                    price +=
                                                        item.quantity *
                                                        item.productDetail
                                                            .discountPrice;

                                                    let name = `${item.productData.name} - ${item.productDetail.nameDetail} - ${item.productdetailsizeData.sizeData.value}`;
                                                    return (
                                                        <ShopCartItem
                                                            isOrder={true}
                                                            id={item.id}
                                                            userId={userId}
                                                            productdetailsizeId={
                                                                item
                                                                    .productdetailsizeData
                                                                    .id
                                                            }
                                                            key={index}
                                                            name={name}
                                                            price={
                                                                item
                                                                    .productDetail
                                                                    .discountPrice
                                                            }
                                                            quantity={
                                                                item.quantity
                                                            }
                                                            image={
                                                                item
                                                                    .productDetailImage?.[0]?.image || "/resources/img/logo.png"
                                                            }
                                                        />
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="box-shipping">
                                <h6>Chọn đơn vị vận chuyển</h6>
                                <div>
                                    {typeShip &&
                                        typeShip.length > 0 &&
                                        typeShip.map((item, index) => {
                                            return (
                                                <div
                                                    key={index}
                                                    className="form-check"
                                                >
                                                    <input
                                                        className="form-check-input"
                                                        checked={
                                                            item.id ===
                                                            dataTypeShip.id
                                                                ? true
                                                                : false
                                                        }
                                                        type="radio"
                                                        name="typeshipRadios"
                                                        id={`typeshipRadios${index}`}
                                                        onChange={() =>
                                                            handleChooseTypeShip(
                                                                item
                                                            )
                                                        }
                                                    />
                                                    <label
                                                        className="form-check-label"
                                                        for={`typeshipRadios${index}`}
                                                    >
                                                        {item.type} -{" "}
                                                        {CommonUtils.formatter.format(
                                                            item.price
                                                        )}
                                                    </label>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                            <div className="box-shopcart-bottom">
                                <div className="content-left">
                                    <div className="wrap-voucher">
                                        <img
                                            width="20px"
                                            height="20px"
                                            style={{ marginLeft: "-3px" }}
                                            src={storeVoucherLogo}
                                        ></img>
                                        <span className="name-easier">
                                            Easier voucher
                                        </span>
                                        <span
                                            onClick={() => handleOpenModal()}
                                            className="choose-voucher"
                                        >
                                            Chọn Mã
                                        </span>
                                        {dataVoucher &&
                                            dataVoucher.voucherData && (
                                                <span className="choose-voucher">
                                                    Mã voucher:{" "}
                                                    {
                                                        dataVoucher.voucherData
                                                            .codeVoucher
                                                    }
                                                </span>
                                            )}
                                    </div>
                                    <div className="wrap-note">
                                        <span>Lời Nhắn:</span>
                                        <input
                                            value={note}
                                            onChange={(event) =>
                                                setnote(event.target.value)
                                            }
                                            type="text"
                                            placeholder="Lưu ý cho Người bán..."
                                        />
                                    </div>
                                </div>
                                <div className="content-right">
                                    <div className="wrap-price">
                                        <span className="text-total">
                                            Tổng thanh toán (
                                            {dataCart && dataCart.length} sản
                                            phẩm):{" "}
                                        </span>

                                        <span className="text-price">
                                            {dataVoucher &&
                                            dataVoucher.voucherData
                                                ? CommonUtils.formatter.format(
                                                      totalPriceDiscount(
                                                          price,
                                                          dataVoucher
                                                      ) + priceShip
                                                  )
                                                : CommonUtils.formatter.format(
                                                      price + +priceShip
                                                  )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
                <div className="wrap-payment">
                    <div className="content-top">
                        <div style={{ display: "flex", gap: "10px" }}>
                            <span>Phương Thức Thanh Toán</span>
                            <div
                                onClick={() => setactiveTypePayment(1)}
                                className={
                                    activeTypePayment === 1
                                        ? "box-type-payment active"
                                        : "box-type-payment"
                                }
                            >
                                Thanh toán Online
                            </div>

                            <div
                                onClick={() => setactiveTypePayment(0)}
                                className={
                                    activeTypePayment === 0
                                        ? "box-type-payment active"
                                        : "box-type-payment"
                                }
                            >
                                Thanh toán khi nhận hàng
                            </div>
                        </div>
                        {activeTypePayment != 0 && (
                            <div className="box-payment">
                                <div
                                    onClick={() => setactiveTypeOnlPayment(1)}
                                    className={
                                        activeTypeOnlPayment === 1
                                            ? "box-type-payment activeOnl"
                                            : "box-type-payment"
                                    }
                                >
                                    Thanh toán PAYPAL
                                </div>
                                <div
                                    onClick={() => setactiveTypeOnlPayment(2)}
                                    className={
                                        activeTypeOnlPayment === 2
                                            ? "box-type-payment activeOnl"
                                            : "box-type-payment"
                                    }
                                >
                                    Thanh toán VNPAY
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="content-bottom">
                        <div className="wrap-bottom">
                            <div className="box-flex">
                                <div className="head">Tổng tiền hàng</div>
                                <div>{CommonUtils.formatter.format(price)}</div>
                            </div>
                            <div className="box-flex">
                                <div className="head">Tổng giảm giá</div>
                                <div>
                                    {dataVoucher && dataVoucher.voucherData
                                        ? CommonUtils.formatter.format(
                                              price -
                                                  totalPriceDiscount(
                                                      price,
                                                      dataVoucher
                                                  )
                                          )
                                        : CommonUtils.formatter.format(0)}
                                </div>
                            </div>
                            <div className="box-flex">
                                <div className="head">Phí vận chuyển</div>
                                <div>
                                    {CommonUtils.formatter.format(priceShip)}
                                </div>
                            </div>

                            <div className="box-flex">
                                <div className="head">Tổng thanh toán:</div>
                                <div className="money">
                                    {dataVoucher && dataVoucher.voucherData
                                        ? CommonUtils.formatter.format(
                                              totalPriceDiscount(
                                                  price,
                                                  dataVoucher
                                              ) + priceShip
                                          )
                                        : CommonUtils.formatter.format(
                                              price + +priceShip
                                          )}
                                </div>
                            </div>
                            <div className="box-flex">
                                <button type="button" disabled={submitting || !dataCart?.length || !addressUserId}
                                    onClick={() => handleSaveOrder()}
                                    className="main_btn"
                                >
                                    {submitting ? "Đang xử lý…" : "Đặt hàng"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <VoucherModal
                    closeModalFromVoucherItem={closeModalFromVoucherItem}
                    price={price + +priceShip}
                    isOpenModal={isOpenModal}
                    closeModal={closeModal}
                    id={userId}
                />
                <AddressUsersModal
                    sendDataFromModalAddress={sendDataFromModalAddress}
                    isOpenModal={isOpenModalAddressUser}
                    closeModaAddressUser={closeModaAddressUser}
                />
            </div>
            <div
                style={{
                    width: "100%",
                    height: "100px",
                    backgroundColor: "#f5f5f5",
                }}
            ></div>
        </>
    );
}

export default OrderHomePage;
