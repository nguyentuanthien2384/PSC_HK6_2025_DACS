import db from "../models/index";

const createProduct = async (data) => {
  return db.Product.create({
    name: data.name,
    contentHTML: data.contentHTML,
    contentMarkdown: data.contentMarkdown,
    statusId: data.statusId || "S1",
    categoryId: data.categoryId,
    view: data.view || 0,
    madeby: data.madeby,
    material: data.material,
    brandId: data.brandId,
  });
};

const getAllProducts = async () => {
  return db.Product.findAll({
    order: [["id", "DESC"]],
  });
};

const getProductById = async (id) => {
  return db.Product.findOne({
    where: { id },
    raw: false,
  });
};

const updateProduct = async (id, data) => {
  const product = await getProductById(id);
  if (!product) return null;

  product.name = data.name ?? product.name;
  product.contentHTML = data.contentHTML ?? product.contentHTML;
  product.contentMarkdown = data.contentMarkdown ?? product.contentMarkdown;
  product.statusId = data.statusId ?? product.statusId;
  product.categoryId = data.categoryId ?? product.categoryId;
  product.view = data.view ?? product.view;
  product.madeby = data.madeby ?? product.madeby;
  product.material = data.material ?? product.material;
  product.brandId = data.brandId ?? product.brandId;

  await product.save();
  return product;
};

const deleteProduct = async (id) => {
  const product = await getProductById(id);
  if (!product) return false;

  await db.Product.destroy({ where: { id } });
  return true;
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
