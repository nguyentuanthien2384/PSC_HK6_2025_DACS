import { getToken, getUser } from "../../utils/token";
import { API_BASE_URL } from "../../axios";
import { toast } from "react-toastify";
import React, { useEffect, useState, useRef } from "react";
import socketIOClient from "socket.io-client";
import { loadMessage } from "../../services/userService";
import moment from "moment";
import 'bootstrap/js/dist/dropdown';

const host = API_BASE_URL;
function ChatWindow(props) {
    const [mess, setMess] = useState([]);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState("");
    const [user, setUser] = useState({});
    const socketRef = useRef();
    const roomScope = useRef(null);
    const chatList = useRef(null);

    useEffect(() => {
        let active = true;
        let sequence = 0;
        const socket = socketIOClient.connect(host, { auth: { token: getToken() } });
        socketRef.current = socket;
        setMess([]);
        setMessage('');
        setSending(false);
        const userData = getUser();
        setUser(userData);

        const refresh = async () => {
            if (!active || !props.roomId) return;
            const ticket = ++sequence;
            try {
                const response = await loadMessage(props.roomId, props.userId);
                if (!active || ticket !== sequence) return;
                if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải tin nhắn.');
                setMess(Array.isArray(response.data) ? response.data : []);
            } catch (error) {
                if (active && ticket === sequence) toast.error(error.message);
            }
        };
        const currentScope = { refresh, sending: false };
        roomScope.current = currentScope;
        socket.on("connect_error", () => { if (active) toast.error("Không thể kết nối hỗ trợ trực tuyến"); });
        socket.on("sendDataServer", (data) => {
            if (data?.roomId != null && String(data.roomId) !== String(props.roomId)) return;
            refresh();
        });
        refresh();

        return () => {
            active = false;
            socket.disconnect();
            if (roomScope.current === currentScope) roomScope.current = null;
        };
    }, [props.roomId, props.userId]);

    useEffect(() => {
        const list = chatList.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, [mess]);

    const sendMessage = () => {
        const text = message.trim();
        const currentScope = roomScope.current;
        if (!text || sending || !currentScope || currentScope.sending) return;
        if (!socketRef.current?.connected) { toast.error("Chưa kết nối hỗ trợ trực tuyến"); return; }
        currentScope.sending = true;
        setSending(true);
        socketRef.current.timeout(10000).emit("sendDataClient", { text, roomId: props.roomId }, (error, result) => {
            if (roomScope.current !== currentScope) return;
            currentScope.sending = false;
            setSending(false);
            if (error || result?.errCode !== 0) {
                toast.error(result?.errMessage || "Chưa gửi được tin nhắn. Vui lòng thử lại.");
                return;
            }
            setMessage((current) => current.trim() === text ? "" : current);
            currentScope.refresh();
        });
    };
    const isOutgoingMessage = (item) => {
        if (user?.id && item?.userData?.id && String(item.userData.id) === String(user.id)) {
            return true;
        }
        const myRole = user?.roleId;
        const senderRole = item?.userData?.roleId;
        if (['R1', 'R4'].includes(myRole) && ['R1', 'R4'].includes(senderRole)) {
            return true;
        }
        return false;
    };

    const otherMember = mess.find((m) => m.userData && String(m.userData.id) !== String(user?.id))?.userData;
    const chatHeaderTitle = otherMember ? `${otherMember.firstName} ${otherMember.lastName}` : "Cuộc trò chuyện";
    const chatHeaderSubtitle = otherMember?.roleId === 'R2' ? 'Khách hàng' : 'Trực tuyến';

    return (
        <div className="ks-messages ks-messenger__messages">
            <div className="ks-header">
                <div className="ks-description">
                    <div className="ks-name">{chatHeaderTitle}</div>
                    <div className="ks-amount">{chatHeaderSubtitle}</div>
                </div>
                <div className="ks-controls">
                    <div className="dropdown">
                        <button
                            className="btn btn-primary-outline ks-light ks-no-text ks-no-arrow"
                            type="button"
                            id="dropdownMenuButton"
                            data-bs-toggle="dropdown"
                            aria-haspopup="true"
                            aria-expanded="false"
                        >
                            <span className="la la-ellipsis-h ks-icon" />
                        </button>
                        <div
                            className="dropdown-menu dropdown-menu-right ks-simple"
                            aria-labelledby="dropdownMenuButton"
                        >
                            <a className="dropdown-item" href="#">
                                <span className="la la-user-plus ks-icon" />
                                <span className="ks-text">Add members</span>
                            </a>
                            <a className="dropdown-item" href="#">
                                <span className="la la-eye-slash ks-icon" />
                                <span className="ks-text">Mark as unread</span>
                            </a>
                            <a className="dropdown-item" href="#">
                                <span className="la la-bell-slash-o ks-icon" />
                                <span className="ks-text">
                                    Mute notifications
                                </span>
                            </a>
                            <a className="dropdown-item" href="#">
                                <span className="la la-mail-forward ks-icon" />
                                <span className="ks-text">Forward</span>
                            </a>
                            <a className="dropdown-item" href="#">
                                <span className="la la-ban ks-icon" />
                                <span className="ks-text">Spam</span>
                            </a>
                            <a className="dropdown-item" href="#">
                                <span className="la la-trash-o ks-icon" />
                                <span className="ks-text">Delete</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            <div
                className="ks-body ks-scrollable jspScrollable"
                data-auto-height
                data-reduce-height=".ks-footer"
                data-fix-height={32}
                style={{
                    height: "480px",
                    overflow: "hidden",
                    padding: "0px",
                    width: "100%",
                }}
                tabIndex={0}
            >
                <div
                    className="jspContainer"
                    style={{ width: "100%", height: "481px" }}
                >
                    <div
                        className="jspPane"
                        style={{ padding: "0px", top: "0px", width: "100%" }}
                    >
                        <ul
                            ref={chatList}
                            id="box-chat"
                            className="ks-items"
                            style={{ overflowY: "auto", width: "100%", maxHeight: "479px" }}
                        >
                            {mess &&
                                mess.length > 0 &&
                                mess.map((item, index) => {
                                    if (item.userData) {
                                        return (
                                            <li
                                                key={item.id || index}
                                                className={
                                                    isOutgoingMessage(item)
                                                        ? "ks-item ks-from"
                                                        : "ks-item ks-self"
                                                }
                                            >
                                                <span className="ks-avatar ks-offline">
                                                    {item.userData.image ? (
                                                        <img
                                                            src={item.userData.image}
                                                            alt={item.userData.firstName || 'Avatar'}
                                                            width={36}
                                                            height={36}
                                                            className="rounded-circle"
                                                            onError={(e) => {
                                                                e.currentTarget.style.display = 'none';
                                                                if (e.currentTarget.nextElementSibling) {
                                                                    e.currentTarget.nextElementSibling.style.display = 'inline';
                                                                }
                                                            }}
                                                        />
                                                    ) : null}
                                                    <span style={{ display: item.userData.image ? 'none' : 'inline' }}>
                                                        {[item.userData.firstName, item.userData.lastName].filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
                                                    </span>
                                                </span>
                                                <div className="ks-body">
                                                    <div className="ks-header">
                                                        <span className="ks-name">
                                                            {item.userData
                                                                .firstName +
                                                                " " +
                                                                item.userData
                                                                    .lastName}
                                                        </span>
                                                        <span className="ks-datetime">
                                                            {moment(
                                                                item.createdAt
                                                            ).fromNow()}
                                                        </span>
                                                    </div>
                                                    <div className="ks-message">
                                                        {item.text}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    }
                                })}
                        </ul>
                    </div>
                    <div className="jspVerticalBar">
                        <div className="jspCap jspCapTop" />
                        <div className="jspTrack" style={{ height: "481px" }}>
                            <div
                                className="jspDrag"
                                style={{ height: "206px" }}
                            >
                                <div className="jspDragTop" />
                                <div className="jspDragBottom" />
                            </div>
                        </div>
                        <div className="jspCap jspCapBottom" />
                    </div>
                </div>
            </div>
            <div className="ks-footer">
                <textarea
                    onChange={(e) => setMessage(e.target.value)}
                    value={message}
                    className="form-control"
                    placeholder="Type something..."
                    maxLength={4000}
                />
                <div className="ks-controls">
                    <button
                        disabled={sending || !message.trim()}
                        onClick={() => sendMessage()}
                        className="btn btn-primary"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ChatWindow;
