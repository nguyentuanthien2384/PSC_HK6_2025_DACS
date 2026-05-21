import bcrypt from "bcryptjs";

const salt = bcrypt.genSaltSync(10);

const hashUserPasswordFromBcrypt = async (password) => {
  return bcrypt.hashSync(password, salt);
};

module.exports = {
  hashUserPasswordFromBcrypt,
};
