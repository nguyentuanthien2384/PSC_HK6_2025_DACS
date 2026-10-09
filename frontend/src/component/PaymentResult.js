import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import { ChooseVoucherStart, getItemCartStart } from "../action/ShopCartAction";
import { paymentOrderSuccessService, paymentOrderVnpaySuccessService } from "../services/userService";
import { getUser } from "../utils/token";

export default function PaymentResult({ provider }) {
    const { search } = useLocation();
    const dispatch = useDispatch();
    const started = useRef(false);
    const [status, setStatus] = useState("loading");
    const [message, setMessage] = useState("");
    const userId = getUser()?.id;
    const confirm = useCallback(async () => {
        setStatus("loading");
        try {
            const params = Object.fromEntries(new URLSearchParams(search));
            if (!params.checkoutToken) throw new Error("Không tìm thấy phiên thanh toán. Vui lòng quay lại giỏ hàng.");
            const result = await (provider === "vnpay" ? paymentOrderVnpaySuccessService(params) : paymentOrderSuccessService(params));
            if (result.errCode !== 0) throw new Error(result.errMessage || "Thanh toán chưa được xác nhận");
            localStorage.removeItem("orderData");
            dispatch(ChooseVoucherStart({}));
            dispatch(getItemCartStart(userId));
            setStatus("success");
            setMessage(`Đơn hàng #${result.orderId || result.data?.id || ""} đã được xác nhận.`);
        } catch (error) {
            setStatus("error");
            setMessage(error.message);
        }
    }, [search, provider, dispatch, userId]);

    useEffect(() => {
        // React StrictMode replays effects; payment capture must start only once.
        if (!started.current) { started.current = true; confirm(); }
    }, [confirm]);

    return <section className="container py-5" aria-live="polite" style={{ minHeight: "45vh" }}>
        <h2>{status === "loading" ? "Đang xác nhận thanh toán…" : status === "success" ? "Thanh toán thành công" : "Chưa thể xác nhận thanh toán"}</h2>
        <p>{message}</p>
        {status === "error" && <button className="btn btn-primary mr-3" onClick={confirm} type="button">Thử xác nhận lại</button>}
        <Link to={status === "success" ? `/user/order/${userId}` : "/shopcart"}>{status === "success" ? "Xem đơn hàng" : "Về giỏ hàng"}</Link>
    </section>;
}
