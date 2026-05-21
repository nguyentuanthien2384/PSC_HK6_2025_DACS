const validateRegisterInput = (data) => {
  if (!data.email || !data.lastName) {
    return {
      isValid: false,
      errCode: 2,
      errMessage: "Missing required parameters !",
    };
  }

  return { isValid: true };
};

module.exports = {
  validateRegisterInput,
};
