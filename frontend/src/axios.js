import axios from "axios";
import { clearAuth, getToken } from "./utils/token";

export const API_BASE_URL = (process.env.REACT_APP_BACKEND_URL || "http://localhost:6969").replace(/\/$/, "");

const instance = axios.create({ baseURL: API_BASE_URL, timeout: 20000 });

// Read the current token on every request, including after login and logout.
instance.interceptors.request.use((config) => {
  const target = new URL(config.url, config.baseURL || API_BASE_URL);
  const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;
  const token = getToken();
  if (token && target.origin === apiOrigin) {
    config.headers.authorization = `Bearer ${token}`;
  } else {
    delete config.headers.authorization;
    delete config.headers.Authorization;
  }
  return config;
});

instance.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    // Phiên đăng nhập không hợp lệ (token cũ / user không còn tồn tại):
    // backend trả về cờ refresh -> xoá session và đưa về trang đăng nhập
    // thay vì văng lỗi runtime đỏ ra màn hình.
    const res = error && error.response;
    const needRefresh = res && (res.status === 401 || res.data?.refresh === true);
    if (needRefresh && getToken()) {
      clearAuth();
      if (window.location.pathname !== "/login") {
        const redirect = window.location.pathname + window.location.search;
        window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
      }
    }
    error.message = res?.data?.errMessage || res?.data?.message ||
      (error.code === "ECONNABORTED" ? "Máy chủ phản hồi quá lâu. Vui lòng thử lại." :
        !res ? "Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại." : error.message);
    return Promise.reject(error);
  },
);

export default instance;
