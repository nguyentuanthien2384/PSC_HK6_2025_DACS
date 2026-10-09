const TOKEN_KEY = "token";
const USER_KEY = "userData";

export const setAuth = (accessToken, user) => {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(accessToken));
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem("persist:shopcart");
  localStorage.removeItem("orderData");
};

export const getToken = () => {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return null;
  try {
    const token = JSON.parse(stored);
    return typeof token === "string" && token ? token : null;
  } catch {
    return stored === "undefined" || stored === "null" ? null : stored;
  }
};

export const getUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY));
    return user && typeof user === "object" && user.id ? user : null;
  } catch {
    return null;
  }
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("persist:shopcart");
  localStorage.removeItem("orderData");
};

