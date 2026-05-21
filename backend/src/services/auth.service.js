import db from "../models/index";
import bcrypt from "bcryptjs";
import { hashUserPasswordFromBcrypt } from "../utils/hash";
import { validateRegisterInput } from "../validations/auth.validation";
import jwtUtils from "../utils/jwt";

const checkUserEmail = async (userEmail) => {
  const user = await db.User.findOne({
    where: { email: userEmail },
  });
  return !!user;
};

const register = async (data) => {
  const validate = validateRegisterInput(data);
  if (!validate.isValid) {
    return {
      errCode: validate.errCode,
      errMessage: validate.errMessage,
    };
  }

  const check = await checkUserEmail(data.email);
  if (check === true) {
    return {
      errCode: 1,
      errMessage: "Your email is already in used, Plz try another email!",
    };
  }

  const hashPassword = await hashUserPasswordFromBcrypt(data.password);

  await db.User.create({
    email: data.email,
    password: hashPassword,
    firstName: data.firstName,
    lastName: data.lastName,
    address: data.address,
    roleId: data.roleId || "R2",
    genderId: data.genderId,
    phonenumber: data.phonenumber,
    image: data.avatar,
    dob: data.dob,
    isActiveEmail: 0,
    statusId: "S1",
    usertoken: "",
  });

  return {
    errCode: 0,
    message: "OK",
  };
};

const login = async (data) => {
  if (!data.email || !data.password) {
    return {
      errCode: 4,
      errMessage: "Missing required parameters!",
    };
  }

  let userData = {};
  const isExist = await checkUserEmail(data.email);

  if (isExist === true) {
    const user = await db.User.findOne({
      attributes: [
        "email",
        "roleId",
        "password",
        "firstName",
        "lastName",
        "id",
      ],
      where: { email: data.email, statusId: "S1" },
      raw: true,
    });

    if (user) {
      const check = bcrypt.compareSync(data.password, user.password);
      if (check) {
        userData.errCode = 0;
        userData.errMessage = "Ok";

        delete user.password;
        userData.user = user;
        userData.accessToken = jwtUtils.encodeToken(user.id);
      } else {
        userData.errCode = 3;
        userData.errMessage = "Wrong password";
      }
    } else {
      userData.errCode = 2;
      userData.errMessage = "User not found!";
    }
  } else {
    userData.errCode = 1;
    userData.errMessage =
      "Your's email isn't exist in your system. plz try other email";
  }

  return userData;
};

module.exports = {
  register,
  login,
};
