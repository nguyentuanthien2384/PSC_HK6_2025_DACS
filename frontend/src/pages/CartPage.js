import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import CartItem from "../components/cart/CartItem";
import {
  fetchMyCartThunk,
  updateCartItemThunk,
  removeCartItemThunk,
} from "../features/cart/cartSlice";

const CartPage = () => {
  const dispatch = useDispatch();
  const { items, status, error } = useSelector((state) => state.cart);

  useEffect(() => {
    dispatch(fetchMyCartThunk());
  }, [dispatch]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const handleIncrease = (item) => {
    dispatch(
      updateCartItemThunk({
        itemId: item.id,
        quantity: Number(item.quantity || 0) + 1,
      }),
    );
  };

  const handleDecrease = (item) => {
    const nextQty = Number(item.quantity || 0) - 1;
    if (nextQty <= 0) {
      dispatch(removeCartItemThunk(item.id));
      return;
    }
    dispatch(
      updateCartItemThunk({
        itemId: item.id,
        quantity: nextQty,
      }),
    );
  };

  const handleRemove = (item) => {
    dispatch(removeCartItemThunk(item.id));
  };

  const grandTotal = (items || []).reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.price || 0);
  }, 0);

  return (
    <div style={{ maxWidth: "900px", margin: "24px auto", padding: "0 12px" }}>
      <h2>My Cart</h2>

      {status === "loading" && <p>Loading...</p>}

      {!status || status !== "loading" ? (
        items && items.length > 0 ? (
          <>
            {items.map((item) => (
              <CartItem
                key={item.id}
                item={item}
                onIncrease={handleIncrease}
                onDecrease={handleDecrease}
                onRemove={handleRemove}
              />
            ))}
            <div style={{ marginTop: "16px", fontSize: "18px", fontWeight: "bold" }}>
              Grand Total: {grandTotal.toLocaleString()} VND
            </div>
          </>
        ) : (
          <p>Gio hang dang trong.</p>
        )
      ) : null}
    </div>
  );
};

export default CartPage;
