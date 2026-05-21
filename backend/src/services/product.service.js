import productRepository from "../repositories/product.repository";

const createNewProduct = async (data) => {
  if (!data.name || !data.categoryId) {
    return {
      errCode: 1,
      errMessage: "Missing required parameters !",
    };
  }

  await productRepository.createProduct(data);
  return {
    errCode: 0,
    errMessage: "ok",
  };
};

const getAllProduct = async () => {
  const products = await productRepository.getAllProducts();
  return {
    errCode: 0,
    data: products,
  };
};

const getDetailProductById = async (id) => {
  if (!id) {
    return {
      errCode: 1,
      errMessage: "Missing required parameters !",
    };
  }

  const product = await productRepository.getProductById(id);
  if (!product) {
    return {
      errCode: 2,
      errMessage: "Product not found",
    };
  }

  return {
    errCode: 0,
    data: product,
  };
};

const handleUpdateProduct = async (data) => {
  if (!data.id) {
    return {
      errCode: 1,
      errMessage: "Missing required parameters !",
    };
  }

  const updated = await productRepository.updateProduct(data.id, data);
  if (!updated) {
    return {
      errCode: 2,
      errMessage: "Product not found",
    };
  }

  return {
    errCode: 0,
    errMessage: "ok",
  };
};

const handleDeleteProduct = async (id) => {
  if (!id) {
    return {
      errCode: 1,
      errMessage: "Missing required parameters !",
    };
  }

  const deleted = await productRepository.deleteProduct(id);
  if (!deleted) {
    return {
      errCode: 2,
      errMessage: "Product not found",
    };
  }

  return {
    errCode: 0,
    errMessage: "ok",
  };
};

module.exports = {
  createNewProduct,
  getAllProduct,
  getDetailProductById,
  handleUpdateProduct,
  handleDeleteProduct,
};
