import productService from "../services/product.service";

const createNewProduct = async (req, res) => {
  try {
    const data = await productService.createNewProduct(req.body);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

const getAllProduct = async (req, res) => {
  try {
    const data = await productService.getAllProduct();
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

const getDetailProductById = async (req, res) => {
  try {
    const data = await productService.getDetailProductById(req.query.id);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const data = await productService.handleUpdateProduct(req.body);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const data = await productService.handleDeleteProduct(req.body.id);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

module.exports = {
  createNewProduct,
  getAllProduct,
  getDetailProductById,
  updateProduct,
  deleteProduct,
};
