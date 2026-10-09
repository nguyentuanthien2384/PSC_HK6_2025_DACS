import React, { useEffect, useRef, useState } from "react";
import { handleVerifyEmail } from "../../../services/userService";
import "./VerifyEmail.scss";

export default function VerifyEmail() {
    const started = useRef(false);
    const [message, setMessage] = useState("Đang xác thực email…");
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id") || params.get("userId");
        const token = params.get("token");
        if (!id || !token) { setMessage("Đường dẫn xác thực email không hợp lệ"); return; }
        handleVerifyEmail({ id, token }).then((result) => {
            setMessage(result.errCode === 0 ? "Xác thực email thành công!" : result.errMessage || "Đường dẫn đã hết hạn hoặc không hợp lệ");
        }).catch((error) => setMessage(error.message));
    }, []);
    return <div className="container-verify-email"><h3 className="text-verify-email" aria-live="polite">{message}</h3></div>;
}
