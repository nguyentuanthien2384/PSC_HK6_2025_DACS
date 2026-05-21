import db from "../models/index";

const getMe = async (req, res) => {
  try {
    const user = await db.User.findOne({
      where: { id: req.user.id, statusId: "S1" },
      attributes: { exclude: ["password"] },
      raw: true,
    });

    if (!user) {
      return res.status(404).json({
        errCode: 1,
        errMessage: "User not found!",
      });
    }

    return res.status(200).json({
      errCode: 0,
      data: user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      errCode: -1,
      errMessage: "Error from server",
    });
  }
};

module.exports = {
  getMe,
};
