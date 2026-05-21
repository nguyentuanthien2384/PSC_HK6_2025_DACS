import { createSlice } from "@reduxjs/toolkit";
import { loginThunk, registerThunk } from "./authThunks";

const parseJSON = (value) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
};

const getInitialToken = () => {
  const stored = parseJSON(localStorage.getItem("token"));
  if (typeof stored === "string") return stored;
  if (stored && typeof stored === "object") return String(stored);
  const raw = localStorage.getItem("token");
  return raw ? raw.replaceAll('"', "") : null;
};

const getInitialUser = () => parseJSON(localStorage.getItem("userData"));

const initialToken = getInitialToken();
const initialUser = getInitialUser();

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: initialUser,
    token: initialToken,
    isAuthenticated: Boolean(initialToken && initialUser),
    status: "idle",
    error: null,
  },
  reducers: {
    clearAuth: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.status = "idle";
      state.error = null;
      localStorage.removeItem("userData");
      localStorage.removeItem("token");
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(registerThunk.fulfilled, (state) => {
        state.status = "succeeded";
      })
      .addCase(registerThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.errMessage || "Đăng ký thất bại";
      })
      .addCase(loginThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        const { user, accessToken } = action.payload;
        state.user = user || null;
        state.token = accessToken || null;
        state.isAuthenticated = Boolean(user && accessToken);
        state.status = "succeeded";
        state.error = null;

        localStorage.setItem("userData", JSON.stringify(user));
        localStorage.setItem("token", JSON.stringify(accessToken));
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.errMessage || "Đăng nhập thất bại";
      });
  },
});

export const { clearAuth } = authSlice.actions;
export default authSlice.reducer;
