import axios from "../axios";

// Day 9 - old project style API helpers
const createNewUser = (data) => {
  return axios.post("/api/auth/register", data);
};

const handleLoginService = (data) => {
  return axios.post("/api/auth/login", data);
};

// Backend Day 9 currently has no dedicated endpoint yet, keep fallback
const checkPhonenumberEmail = async () => {
  return {
    isCheck: false,
    errMessage: "Hợp lệ",
  };
};

export { handleLoginService, checkPhonenumberEmail, createNewUser };
