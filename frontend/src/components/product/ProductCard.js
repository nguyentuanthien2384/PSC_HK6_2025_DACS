import React from "react";
import { Link } from "react-router-dom";

const ProductCard = ({ product }) => {
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: "8px",
        padding: "16px",
        background: "#fff",
      }}
    >
      <h4 style={{ marginBottom: "8px" }}>{product?.name || "No name"}</h4>
      <p style={{ margin: 0, color: "#666" }}>Category: {product?.categoryId || "-"}</p>
      <p style={{ margin: "6px 0 0", color: "#666" }}>Brand: {product?.brandId || "-"}</p>
      <p style={{ margin: "6px 0 0", color: "#666" }}>Material: {product?.material || "-"}</p>
      <div style={{ marginTop: "12px" }}>
        <Link to={`/products/${product?.id}`}>Xem chi tiet</Link>
      </div>
    </div>
  );
};

export default ProductCard;
