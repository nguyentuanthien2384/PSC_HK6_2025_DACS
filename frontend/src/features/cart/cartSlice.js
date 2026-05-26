import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "../../axios";

export const fetchMyCartThunk = createAsyncThunk(
  "cart/fetchMyCart",
  async (_, { rejectWithValue }) => {
    try {
      const res = await axios.get("/api/cart/my-cart");
      if (res && res.errCode === 0) return res.data;
      return rejectWithValue(res || { errMessage: "Load cart failed" });
    } catch (error) {
      return rejectWithValue({
        errMessage: error?.message || "Server error while loading cart",
      });
    }
  },
);

export const addItemToCartThunk = createAsyncThunk(
  "cart/addItem",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const res = await axios.post("/api/cart/add-item", payload);
      if (res && res.errCode === 0) {
        await dispatch(fetchMyCartThunk());
        return res;
      }
      return rejectWithValue(res || { errMessage: "Add to cart failed" });
    } catch (error) {
      return rejectWithValue({
        errMessage: error?.message || "Server error while adding item",
      });
    }
  },
);

export const updateCartItemThunk = createAsyncThunk(
  "cart/updateItem",
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const res = await axios.put("/api/cart/update-item", payload);
      if (res && res.errCode === 0) {
        await dispatch(fetchMyCartThunk());
        return res;
      }
      return rejectWithValue(res || { errMessage: "Update cart item failed" });
    } catch (error) {
      return rejectWithValue({
        errMessage: error?.message || "Server error while updating item",
      });
    }
  },
);

export const removeCartItemThunk = createAsyncThunk(
  "cart/removeItem",
  async (itemId, { rejectWithValue, dispatch }) => {
    try {
      const res = await axios.delete("/api/cart/remove-item", {
        data: { itemId },
      });
      if (res && res.errCode === 0) {
        await dispatch(fetchMyCartThunk());
        return res;
      }
      return rejectWithValue(res || { errMessage: "Remove cart item failed" });
    } catch (error) {
      return rejectWithValue({
        errMessage: error?.message || "Server error while removing item",
      });
    }
  },
);

const cartSlice = createSlice({
  name: "cart",
  initialState: {
    cart: null,
    items: [],
    status: "idle",
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyCartThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMyCartThunk.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.cart = action.payload?.cart || null;
        state.items = action.payload?.items || [];
      })
      .addCase(fetchMyCartThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.errMessage || "Load cart failed";
      })
      .addCase(addItemToCartThunk.pending, (state) => {
        state.status = "loading";
      })
      .addCase(addItemToCartThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.errMessage || "Add to cart failed";
      })
      .addCase(updateCartItemThunk.pending, (state) => {
        state.status = "loading";
      })
      .addCase(updateCartItemThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.errMessage || "Update cart item failed";
      })
      .addCase(removeCartItemThunk.pending, (state) => {
        state.status = "loading";
      })
      .addCase(removeCartItemThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.errMessage || "Remove cart item failed";
      });
  },
});

export default cartSlice.reducer;
