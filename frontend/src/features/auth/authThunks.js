import { createAsyncThunk } from "@reduxjs/toolkit";
import { createNewUser, handleLoginService } from "../../services/userService";

export const registerThunk = createAsyncThunk(
  "auth/register",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await createNewUser(payload);
      if (res && res.errCode === 0) return res;
      return rejectWithValue(res || { errMessage: "Đăng ký thất bại" });
    } catch (error) {
      return rejectWithValue({
        errMessage: error?.message || "Lỗi server khi đăng ký",
      });
    }
  },
);

export const loginThunk = createAsyncThunk(
  "auth/login",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await handleLoginService(payload);
      if (res && res.errCode === 0) return res;
      return rejectWithValue(res || { errMessage: "Đăng nhập thất bại" });
    } catch (error) {
      return rejectWithValue({
        errMessage: error?.message || "Lỗi server khi đăng nhập",
      });
    }
  },
);
