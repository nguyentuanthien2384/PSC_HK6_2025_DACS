import JWT from "jsonwebtoken";
require("dotenv").config();

const encodeToken = (userId) => {
  return JWT.sign(
    {
      iss: "Bi Ngo",
      sub: userId,
      iat: new Date().getTime(),
      exp: new Date().setDate(new Date().getDate() + 3),
    },
    process.env.JWT_SECRET,
  );
};

module.exports = {
  encodeToken,
};
