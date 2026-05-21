import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { getDetailProductApi } from "../api/product.api";
import ProductGallery from "../components/product/ProductGallery";

const ProductDetailPage = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await getDetailProductApi(id);
      if (res && res.errCode === 0) {
        setProduct(res.data || null);
      } else {
        toast.error(res?.errMessage || "Khong tim thay san pham");
      }
    } catch (error) {
      toast.error("Server error while loading product detail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  if (loading) {
    return <div style={{ maxWidth: "1100px", margin: "24px auto" }}>Loading...</div>;
  }

  if (!product) {
    return (
      <div style={{ maxWidth: "1100px", margin: "24px auto" }}>
        <p>Khong tim thay san pham.</p>
        <Link to="/products">Quay lai danh sach</Link>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "24px auto",
        padding: "0 12px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px",
      }}
    >
      <ProductGallery product={product} />
      <div>
        <h2>{product.name}</h2>
        <p>
          <strong>Category:</strong> {product.categoryId || "-"}
        </p>
        <p>
          <strong>Brand:</strong> {product.brandId || "-"}
        </p>
        <p>
          <strong>Material:</strong> {product.material || "-"}
        </p>
        <p>
          <strong>Made by:</strong> {product.madeby || "-"}
        </p>
        <div style={{ marginTop: "12px" }}>
          <strong>Mo ta:</strong>
          <div
            style={{ marginTop: "8px" }}
            dangerouslySetInnerHTML={{ __html: product.contentHTML || "" }}
          />
        </div>
        <div style={{ marginTop: "16px" }}>
          <Link to="/products">Quay lai danh sach</Link>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
