import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import { ChooseVoucherStart, getItemCartStart } from "../action/ShopCartAction";
import { paymentOrderSuccessService, paymentOrderVnpaySuccessService } from "../services/userService";
import { getUser } from "../utils/token";
import { isDemoPayment } from "../utils/payments";

export default function PaymentResult({ provider }) {
    const { search } = useLocation();
    const dispatch = useDispatch();
    const started = useRef(null);
    const pending = useRef(null);
    const mounted = useRef(true);
    const [status, setStatus] = useState("loading");
    const [message, setMessage] = useState("");
    const userId = getUser()?.id;
    const scope = `${provider}:${search}:${userId}`;
    const currentScope = useRef(scope);
    currentScope.current = scope;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const confirm = useCallback(async () => {
        if (pending.current === scope) return;
        pending.current = scope;
        setStatus("loading");
        setMessage("");
        try {
            const params = Object.fromEntries(new URLSearchParams(search));
            if (!params.checkoutToken) throw new Error("Không tìm thấy phiên thanh toán. Vui lòng quay lại giỏ hàng.");
            if (params.cancelled === 'true') throw new Error("Bạn đã hủy thanh toán. Đơn hàng chưa được xác nhận.");
            if (provider === "paypal") params.paymentId = params.paymentId || params.token;
            const result = await (provider === "vnpay" ? paymentOrderVnpaySuccessService(params) : paymentOrderSuccessService(params));
            if (!mounted.current || currentScope.current !== scope) return;
            const orderId = result?.orderId || result?.data?.id;
            if (isDemoPayment(result) || isDemoPayment(result?.paymentSession)) throw new Error("Dữ liệu demo / mô phỏng, không phải giao dịch cổng thanh toán.");
            if (result?.errCode !== 0 || result?.status !== 'COMPLETED' || !orderId) throw new Error(result?.errMessage || "Thanh toán chưa được xác nhận. Cửa hàng cần đối soát giao dịch.");
            localStorage.removeItem("orderData");
            dispatch(ChooseVoucherStart({}));
            dispatch(getItemCartStart(userId));
            setStatus("success");
            setMessage(`Đơn hàng #${orderId} đã được xác nhận.`);
        } catch (error) {
            if (mounted.current && currentScope.current === scope) { setStatus("error"); setMessage(error.message); }
        } finally {
            if (pending.current === scope) pending.current = null;
        }
    }, [search, provider, dispatch, userId, scope]);

    useEffect(() => {
        // React StrictMode replays effects; payment capture must start only once.
        if (started.current !== scope) { started.current = scope; confirm(); }
    }, [confirm, scope]);

    return <section className="container py-5" aria-live="polite" style={{ minHeight: "45vh" }}>
        <h2>{status === "loading" ? "Đang xác nhận thanh toán…" : status === "success" ? "Thanh toán thành công" : "Chưa thể xác nhận thanh toán"}</h2>
        <p>{message}</p>
        {status === "error" && <button className="btn btn-primary mr-3" onClick={confirm} type="button">Thử xác nhận lại</button>}
        <Link to={status === "success" ? `/user/order/${userId}` : "/shopcart"}>{status === "success" ? "Xem đơn hàng" : "Về giỏ hàng"}</Link>
    </section>;
}
