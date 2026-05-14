import axios from "axios";
const instance = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || "http://localhost:6969"
});
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default instance;
