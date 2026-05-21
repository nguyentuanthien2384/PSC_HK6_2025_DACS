const TOKEN_KEY = "token";
const USER_KEY = "userData";

const setAuth = (accessToken, user) => {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(accessToken));
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const getToken = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? token.replaceAll('"', "") : null;
};

const getUser = () => {
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
};

const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

module.exports = {
  setAuth,
  getToken,
  getUser,
  clearAuth,
};
