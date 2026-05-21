import React from "react";

const ProductGallery = ({ product }) => {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: "10px",
        padding: "16px",
        background: "#fff",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "260px",
          borderRadius: "8px",
          background: "#f7f7f7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: "14px",
        }}
      >
        {product?.name || "Product image"}
      </div>
      <div style={{ marginTop: "10px", color: "#777", fontSize: "13px" }}>
        Gallery placeholder (Day 15)
      </div>
    </div>
  );
};

export default ProductGallery;
