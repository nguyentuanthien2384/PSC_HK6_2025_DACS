import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getAllProductApi } from "../api/product.api";
import ProductCard from "../components/product/ProductCard";

const ProductListPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await getAllProductApi();
      if (res && res.errCode === 0) {
        setProducts(res.data || []);
      } else {
        toast.error(res?.errMessage || "Load products failed");
      }
    } catch (error) {
      toast.error("Server error while loading products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return (
    <div style={{ maxWidth: "1100px", margin: "24px auto", padding: "0 12px" }}>
      <h2 style={{ marginBottom: "16px" }}>Product List</h2>

      {loading ? (
        <p>Loading...</p>
      ) : products.length === 0 ? (
        <p>Chua co san pham nao.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "12px",
          }}
        >
          {products.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductListPage;
