import axios from "../axios";

const registerApi = (payload) => {
  return axios.post("/api/auth/register", payload);
};

const loginApi = (payload) => {
  return axios.post("/api/auth/login", payload);
};

module.exports = {
  registerApi,
  loginApi,
};
