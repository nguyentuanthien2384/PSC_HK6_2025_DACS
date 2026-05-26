import React from "react";

const CartItem = ({ item, onIncrease, onDecrease, onRemove }) => {
  const quantity = Number(item?.quantity || 0);
  const price = Number(item?.price || 0);
  const total = quantity * price;

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "10px",
        background: "#fff",
      }}
    >
      <h5 style={{ margin: 0 }}>{item?.productData?.name || `Product #${item?.productId}`}</h5>
      <p style={{ margin: "8px 0 0", color: "#666" }}>Price: {price.toLocaleString()} VND</p>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
        <button onClick={() => onDecrease(item)}>-</button>
        <span>{quantity}</span>
        <button onClick={() => onIncrease(item)}>+</button>
      </div>

      <p style={{ margin: "10px 0 0", fontWeight: "bold" }}>
        Total: {total.toLocaleString()} VND
      </p>

      <button
        onClick={() => onRemove(item)}
        style={{ marginTop: "8px", background: "#dc3545", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px" }}
      >
        Remove
      </button>
    </div>
  );
};

export default CartItem;
