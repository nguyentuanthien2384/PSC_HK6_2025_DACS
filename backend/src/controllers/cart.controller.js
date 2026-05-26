import cartService from "../services/cart.service";

const addToCart = async (req, res) => {
  try {
    const data = await cartService.addToCart(req.body, req.user);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

const getMyCart = async (req, res) => {
  try {
    const data = await cartService.getCartByUser(req.user);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

const updateCartItem = async (req, res) => {
  try {
    const data = await cartService.updateCartItem(req.body, req.user);
    return res.status(200).json(data);
  } catch (error) {
    console.log(error);
    return res.status(200).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

const removeCartItem = async (req, res) => {
  try {
    const data = await cartService.removeCartItem(req.body.itemId, req.user);
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
  addToCart,
  getMyCart,
  updateCartItem,
  removeCartItem,
};
