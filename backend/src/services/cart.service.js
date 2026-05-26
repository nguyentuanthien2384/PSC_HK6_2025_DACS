import db from "../models/index";

const getOrCreateActiveCart = async (userId) => {
  let cart = await db.Cart.findOne({
    where: { userId, status: "ACTIVE" },
  });

  if (!cart) {
    cart = await db.Cart.create({
      userId,
      status: "ACTIVE",
    });
  }

  return cart;
};

const addToCart = async (data, user) => {
  if (!data.productId || !data.quantity) {
    return {
      errCode: 1,
      errMessage: "Missing required parameters !",
    };
  }

  const cart = await getOrCreateActiveCart(user.id);

  const existed = await db.CartItem.findOne({
    where: {
      cartId: cart.id,
      productId: data.productId,
    },
    raw: false,
  });

  if (existed) {
    existed.quantity = Number(existed.quantity || 0) + Number(data.quantity || 0);
    if (data.price !== undefined) existed.price = data.price;
    await existed.save();
  } else {
    await db.CartItem.create({
      cartId: cart.id,
      productId: data.productId,
      quantity: data.quantity,
      price: data.price || 0,
    });
  }

  return {
    errCode: 0,
    errMessage: "ok",
  };
};

const getCartByUser = async (user) => {
  const cart = await getOrCreateActiveCart(user.id);
  const items = await db.CartItem.findAll({
    where: { cartId: cart.id },
    include: [
      {
        model: db.Product,
        as: "productData",
        required: false,
      },
    ],
    raw: true,
    nest: true,
  });

  return {
    errCode: 0,
    data: {
      cart,
      items,
    },
  };
};

const updateCartItem = async (data, user) => {
  if (!data.itemId || data.quantity === undefined) {
    return {
      errCode: 1,
      errMessage: "Missing required parameters !",
    };
  }

  const cart = await getOrCreateActiveCart(user.id);
  const item = await db.CartItem.findOne({
    where: { id: data.itemId, cartId: cart.id },
    raw: false,
  });

  if (!item) {
    return {
      errCode: 2,
      errMessage: "Cart item not found",
    };
  }

  item.quantity = data.quantity;
  await item.save();

  return {
    errCode: 0,
    errMessage: "ok",
  };
};

const removeCartItem = async (itemId, user) => {
  if (!itemId) {
    return {
      errCode: 1,
      errMessage: "Missing required parameters !",
    };
  }

  const cart = await getOrCreateActiveCart(user.id);
  const item = await db.CartItem.findOne({
    where: { id: itemId, cartId: cart.id },
  });

  if (!item) {
    return {
      errCode: 2,
      errMessage: "Cart item not found",
    };
  }

  await db.CartItem.destroy({ where: { id: itemId } });
  return {
    errCode: 0,
    errMessage: "ok",
  };
};

module.exports = {
  addToCart,
  getCartByUser,
  updateCartItem,
  removeCartItem,
};
