const user = require("../models/userModel");
const Otp = require("../models/otpModel");
const Wallet = require("../models/walletModel");
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");
const { catchAsyncError } = require("../utils/generateError.js");
const { bcryptedPasswordFunc, verifyPassword } = require("../utils/bcryption");
const { generateUserToken } = require("../utils/tokenUtils");

exports.sendOtp = catchAsyncError(async (req, res) => {
  const { countryCode, mobileNumber } = req.body;
  if (!countryCode || !mobileNumber) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "countryCode and mobileNumber are required",
    });
  }
  const existingUser = await user.findOne({
    countryCode,
    mobileNumber
  });
  //blocked
  if (existingUser && existingUser.status === "blocked") {
    return responseHandler({
      res,
      code: statusCode.FORBIDDEN,
      message: "Your account has been blocked"
    });
  }
  //active
  if (existingUser && existingUser.status === "active") {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "User already registered. Please login"
    });
  }
  // DELETED or NEW USER → allow OTP
  //Generate OTP (4 digits)
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  const expiry = new Date(Date.now() + 5 * 60 * 1000);
  // purge old OTPs for same number
  await Otp.deleteMany({ countryCode, mobileNumber });
  //store new OTP
  await Otp.create({
    countryCode,
    mobileNumber,
    otp,
    expiresAt: expiry
  });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "OTP sent successfully",
    data: { countryCode, mobileNumber, otp, expiresAt: expiry } // prod me otp mat bhejna
  });
});
exports.verifyOtpAndRegister = catchAsyncError(async (req, res) => {
  const { countryCode, mobileNumber, otp, username, fullname, email, password, dob, gender } = req.body;
  if (!countryCode || !mobileNumber || !otp || !username || !fullname || !email || !password || !dob || !gender) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Required fields missing"
    });
  }
  const otpDoc = await Otp.findOne({ countryCode, mobileNumber });
  if (!otpDoc) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "OTP expired or not found"
    });
  }
  if (otpDoc.otp !== otp) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid OTP"
    });
  }
  // delete OTP after success
  await Otp.deleteOne({ _id: otpDoc._id });

  const existingUser = await user.findOne({
    $or: [
      { username },
      { email },
      { countryCode, mobileNumber }
    ],
    status: { $ne: "deleted" }
  });

  if (existingUser) {
    if (existingUser.status === "blocked") {
      return responseHandler({
        res,
        code: statusCode.FORBIDDEN,
        message: "Your account has been blocked"
      });
    }

    let conflictField = "";
    if (existingUser.username === username) {
      conflictField = "Username";
    } else if (existingUser.email === email) {
      conflictField = "Email";
    } else {
      conflictField = "Mobile number";
    }

    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: `${conflictField} already exists`
    });
  }

  const deletedUser = await user.findOne({
    countryCode,
    mobileNumber,
    status: "deleted"
  });

  const lastUser = await user.aggregate([
    { $match: { shortId: { $regex: /^U-\d+$/ } } },
    {
      $addFields: {
        numericShortId: {
          $toInt: { $substr: ["$shortId", 2, -1] }
        }
      }
    },
    { $sort: { numericShortId: -1 } },
    { $limit: 1 }
  ]);

  const newShortId = lastUser.length > 0 ? `U-${lastUser[0].numericShortId + 1}` : "U-1";

  const hashedPassword = await bcryptedPasswordFunc(password);

  let userData;

  // RE-REGISTER (deleted)
  if (deletedUser) {
    deletedUser.username = username;
    deletedUser.fullname = fullname;
    deletedUser.email = email;
    deletedUser.password = hashedPassword;
    deletedUser.dob = dob;
    deletedUser.gender = gender;
    deletedUser.shortId = newShortId;
    deletedUser.status = "active";

    deletedUser.addresses = [];
    deletedUser.devices = [];

    userData = deletedUser;

  } else {
    // NEW USER
    userData = await user.create({
      shortId: newShortId,
      countryCode,
      mobileNumber,
      username,
      fullname,
      email,
      password: hashedPassword,
      dob,
      gender,
      status: "active",
      walletBalance: 0,
      isWelcomeBonusGiven: false 
    });
  }

  // WELCOME BONUS
  if (!userData.isWelcomeBonusGiven) {

    // extra safety (double protection)
    const existingBonus = await Wallet.findOne({
      userId: userData._id,
      reason: "welcome_bonus"
    });

    if (!existingBonus) {
      userData.walletBalance = (userData.walletBalance || 0) + 50;
      userData.isWelcomeBonusGiven = true;

      await Wallet.create({
        userId: userData._id,
        amount: 50,
        type: "credit",
        reason: "welcome_bonus",
        balanceAfter: userData.walletBalance
      });
    }
  }

  await userData.save();

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Account created successfully"
  });
});
exports.login = catchAsyncError(async (req, res) => {
  const { usernameOrEmail, password, deviceType, deviceToken, agreeToTerms } = req.body;
  const agreedToTerms = agreeToTerms === true || agreeToTerms === "true";
  if (!usernameOrEmail || !password || !deviceType || !deviceToken || !agreedToTerms) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Username/Email, password, deviceType, deviceToken and agreeToTerms(true) are required",
    });
  }

  const foundUser = await user.findOne({
    $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    status: "active"
  });
  console.log("Found user for login:", foundUser);

  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials",
    });
  }

  // On first login after agreeToTerms:true is sent, store acceptance in DB.
  if (agreedToTerms && foundUser.agreeToTerms !== true) {
    foundUser.agreeToTerms = true;
  }

  const isPasswordValid = await verifyPassword(password, foundUser.password);
  if (!isPasswordValid) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials",
    });
  }

  const token = generateUserToken(foundUser);

  // Ensure deviceToken is unique inside this user devices array.
  const existingDevice = foundUser.devices.find((d) => d.deviceToken === deviceToken);
  if (existingDevice) {
    existingDevice.deviceType = deviceType;
    existingDevice.accessToken = token;
    existingDevice.updatedAt = new Date();
  } else {
    foundUser.devices.push({
      deviceType,
      deviceToken,
      accessToken: token
    });
  }

  await foundUser.save();

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Login successful",
    data: { token },
  });
});
exports.forgetPassword = catchAsyncError(async (req, res) => {
  const { usernameOrEmail } = req.body;
  if (!usernameOrEmail) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Username or email is required",
    });
  }

  const foundUser = await user.findOne({
    $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    status: "active",
  });

  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found",
    });
  }
  // Generate 6 digit OTP and setting expiration (15 minutes)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  foundUser.resetPasswordOTP = otp;
  foundUser.resetPasswordExpires = expiresAt;
  await foundUser.save();

  // TODO: integrate email service (nodemailer) to email the OTP to foundUser.email.
  // For now response includes otp for dev/testing purposes.

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Password reset OTP generated successfully",
    data: {
      username: foundUser.username,
      email: foundUser.email,
      otp
    },
  });
});
exports.verifyPasswordResetOTP = catchAsyncError(async (req, res) => {
  const { usernameOrEmail, otp, newPassword } = req.body;
  if (!usernameOrEmail || !otp || !newPassword) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Username/Email, OTP and new password are required",
    });
  }
  const foundUser = await user.findOne({
    $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    status: "active",
    resetPasswordOTP: otp,
    resetPasswordExpires: { $gt: new Date() }
  });
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid OTP or OTP has expired",
    });
  }
  foundUser.password = await bcryptedPasswordFunc(newPassword);
  foundUser.resetPasswordOTP = undefined;
  foundUser.resetPasswordExpires = undefined;
  await foundUser.save();
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Password reset successful",
  });
});
exports.getprofile = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }

  const profileData = foundUser.toObject();
  if (req.accessToken && Array.isArray(profileData.devices)) {
    profileData.devices = profileData.devices.find(
      (device) => device.accessToken === req.accessToken
    );
  }

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "User profile retrieved successfully",
    data: profileData
  });
});
exports.editprofile = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const updateFields = { ...req.body };
  const ignoredFields = ["email"];
  const allowedFields = [
    "fullname",
    "username",
    "countryCode",
    "mobileNumber",
    "dob",
    "gender",
    "bio",
    "profileImage",
    // "addresses",
    // "accountPrivacy"
  ];

  ignoredFields.forEach((field) => {
    delete updateFields[field];
  });

  const isValidUpdate = Object.keys(updateFields).every((field) =>
    allowedFields.includes(field)
  );
  if (!isValidUpdate) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: `Only the following fields can be updated: ${allowedFields.join(", ")}`
    });
  }
  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }

  if (
    updateFields.username &&
    updateFields.username !== foundUser.username
  ) {
    const usernameExists = await user.findOne({
      _id: { $ne: userId },
      username: updateFields.username,
      status: { $ne: "deleted" }
    });
    if (usernameExists) {
      return responseHandler({
        res,
        code: statusCode.CONFLICT,
        message: "Username already exists, please choose another username"
      });
    }
  }

  const nextCountryCode = updateFields.countryCode || foundUser.countryCode;
  const nextMobileNumber = updateFields.mobileNumber || foundUser.mobileNumber;
  const isMobileUpdated =
    nextCountryCode !== foundUser.countryCode ||
    nextMobileNumber !== foundUser.mobileNumber;

  if (isMobileUpdated) {
    const mobileExists = await user.findOne({
      _id: { $ne: userId },
      countryCode: nextCountryCode,
      mobileNumber: nextMobileNumber,
      status: { $ne: "deleted" }
    });
    if (mobileExists) {
      return responseHandler({
        res,
        code: statusCode.CONFLICT,
        message: "Mobile number already exists"
      });
    }
  }

  Object.keys(updateFields).forEach((field) => {
    foundUser[field] = updateFields[field];
  });
  await foundUser.save();
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Profile updated successfully",
    data: foundUser
  });
});
exports.changepassword = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Current password and new password are required",
    });
  }
  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }
  const isPasswordValid = await verifyPassword(currentPassword, foundUser.password);
  if (!isPasswordValid) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Current password is incorrect",
    });
  }
  foundUser.password = await bcryptedPasswordFunc(newPassword);
  await foundUser.save();
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Password changed successfully",
  });
});
exports.getalladdresses = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Addresses retrieved successfully",
    data: foundUser.addresses
  });
});
exports.addorupdateaddress = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const { addressId, addressTag, countryCode, mobileNumber, location, isDefault } = req.body;
  const { coords, address, pincode, landmark } = location || {};

  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }
  // 👉 if first address → auto default
  const isFirstAddress = foundUser.addresses.length === 0;
  if (addressId) {
    //UPDATE
    const addressToUpdate = foundUser.addresses.id(addressId);
    if (!addressToUpdate) {
      return responseHandler({
        res,
        code: statusCode.RESULTNOTFOUND,
        message: "Address not found"
      });
    }
    // 👉 agar isDefault true aaya → baaki sab false
    if (isDefault === true) {
      for (let i = 0; i < foundUser.addresses.length; i++) {
        foundUser.addresses[i].isDefault = false;
      }
      addressToUpdate.isDefault = true;
    }
    if (addressTag !== undefined) addressToUpdate.addressTag = addressTag;
    if (countryCode !== undefined) addressToUpdate.countryCode = countryCode;
    if (mobileNumber !== undefined) addressToUpdate.mobileNumber = mobileNumber;

    if (location) {
      if (coords) addressToUpdate.location.coordinates = coords;
      if (address) addressToUpdate.location.address = address;
      if (pincode) addressToUpdate.location.pincode = pincode;
      if (landmark) addressToUpdate.location.landmark = landmark;
    }
  } else {
    //ADD
    let makeDefault = false;
    if (isFirstAddress) {
      makeDefault = true; // 👉 first address always default
    } else if (isDefault === true) {
      makeDefault = true;

      // 👉 baaki sab false
      for (let i = 0; i < foundUser.addresses.length; i++) {
        foundUser.addresses[i].isDefault = false;
      }
    }
    foundUser.addresses.push({
      addressTag,
      countryCode,
      mobileNumber,
      isDefault: makeDefault,
      location: {
        type: "Point",
        coordinates: coords,
        address,
        pincode,
        landmark
      }
    });
  }
  await foundUser.save();
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Address added/updated successfully",
    data: foundUser.addresses
  });
});
exports.deleteaddress = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const { addressId } = req.query;
  if (!addressId) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Address ID is required",
    });
  }
  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }
  const addressToDelete = foundUser.addresses.id(addressId);
  if (!addressToDelete) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Address not found"
    });
  }
  //block if default
  if (addressToDelete.isDefault) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Default address cannot be deleted. Please change default address first."
    });
  }
  addressToDelete.deleteOne();
  await foundUser.save();
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Address deleted successfully"
  });
});
exports.updateaccountPrivacy = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const { accountPrivacy } = req.body;
  if (!accountPrivacy || !["public", "private"].includes(accountPrivacy)) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Account privacy value is required and must be either 'public' or 'private'",
    });
  }
  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }
  foundUser.accountPrivacy = accountPrivacy;
  await foundUser.save();
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Account privacy updated to " + accountPrivacy + " successfully"
  });
});
exports.logout = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const accessToken = req.accessToken;
  const foundUser = await user.findById(userId);
  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found"
    });
  }
  if (foundUser.devices && foundUser.devices.length > 0) {
    foundUser.devices = foundUser.devices.filter(
      (device) => device.accessToken !== accessToken
    );
    await foundUser.save();
  }
  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Logged out successfully",
  });
});