const Admin = require("../../models/adminModel");
const { responseHandler } = require("../../utils/responseHandler");
const statusCode = require("../../utils/httpResponseCode");
const { catchAsyncError } = require("../../utils/generateError");
const { generateAdminToken } = require("../../utils/tokenUtils");

const sanitizeAdmin = (admin) => {
  const adminData = admin.toObject ? admin.toObject() : { ...admin };
  delete adminData.password;
  delete adminData.resetPasswordOTP;
  delete adminData.resetPasswordExpires;
  return adminData;
};
const getNextAdminId = async () => {
  const lastAdmin = await Admin.aggregate([
    { $match: { adminId: { $regex: /^A-\d+$/ } } },
    {
      $addFields: {
        numericAdminId: { $toInt: { $substr: ["$adminId", 2, -1] } }
      }
    },
    { $sort: { numericAdminId: -1 } },
    { $limit: 1 }
  ]);

  return lastAdmin.length > 0 ? `A-${lastAdmin[0].numericAdminId + 1}` : "A-1";
};
exports.login = catchAsyncError(async (req, res) => {
  const { usernameOrEmail, password, deviceType, deviceToken } = req.body;

  if (!usernameOrEmail || !password || !deviceType || !deviceToken) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "usernameOrEmail, password, deviceType and deviceToken are required"
    });
  }

  const admin = await Admin.findOne({
    $or: [
      { username: usernameOrEmail.toLowerCase() },
      { email: usernameOrEmail.toLowerCase() }
    ],
    status: "active"
  });

  if (!admin) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials"
    });
  }

  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials"
    });
  }

  const token = generateAdminToken(admin);
  const existingDevice = admin.devices.find((device) => device.deviceToken === deviceToken);
  if (existingDevice) {
    existingDevice.deviceType = deviceType;
    existingDevice.accessToken = token;
  } else {
    admin.devices.push({
      deviceType,
      deviceToken,
      accessToken: token
    });
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const adminData = admin.toObject();
  delete adminData.password;
  delete adminData.resetPasswordOTP;
  delete adminData.resetPasswordExpires;

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Admin login successful",
    data: {
      token,
      admin: adminData
    }
  });
});
exports.logout = catchAsyncError(async (req, res) => {
  const adminId = req.adminId || (req.admin && req.admin._id);
  const accessToken = req.accessToken;

  const admin = await Admin.findById(adminId);
  if (!admin) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Admin not found"
    });
  }

  admin.devices = admin.devices.filter(
    (device) => device.accessToken !== accessToken
  );
  await admin.save();

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Admin logged out successfully"
  });
});
exports.createSubAdmin = catchAsyncError(async (req, res) => {
  const {
    fullName,
    username,
    email,
    countryCode,
    mobileNumber,
    password,
    profileImage,
    permissions,
    reportsTo
  } = req.body;

  if (!fullName || !username || !email || !password || !permissions) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "fullName, username, email, password and permissions are required"
    });
  }

  const normalizedUsername = username.toLowerCase();
  const normalizedEmail = email.toLowerCase();

  const existingAdmin = await Admin.findOne({
    $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    status: { $ne: "deleted" }
  });

  if (existingAdmin) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: existingAdmin.username === normalizedUsername
        ? "Username already exists"
        : "Email already exists"
    });
  }

  if (countryCode && mobileNumber) {
    const existingMobile = await Admin.findOne({
      countryCode,
      mobileNumber,
      status: { $ne: "deleted" }
    });

    if (existingMobile) {
      return responseHandler({
        res,
        code: statusCode.CONFLICT,
        message: "Mobile number already exists"
      });
    }
  }

  const adminId = await getNextAdminId();
  const createdAdmin = await Admin.create({
    adminId,
    role: "sub_admin",
    fullName,
    username: normalizedUsername,
    email: normalizedEmail,
    countryCode: countryCode,
    mobileNumber,
    password,
    permissions: Array.isArray(permissions) ? permissions : [],
    profileImage: profileImage || "",
    reportsTo: reportsTo || req.adminId,
    createdBy: req.adminId
  });

  await Admin.findByIdAndUpdate(req.adminId, {
    $addToSet: { managedAdmins: createdAdmin._id }
  });

  return responseHandler({
    res,
    code: statusCode.CREATED,
    message: "SubAdmin created successfully",
    data: sanitizeAdmin(createdAdmin)
  });
});
exports.updateAdmin = catchAsyncError(async (req, res) => {
  const { adminId } = req.query;
  const allowedFields = [
    "fullName",
    "username",
    "email",
    "countryCode",
    "mobileNumber",
    "password",
    "profileImage",
    "permissions",
    "reportsTo"
  ];

  const updateFields = {};
  Object.keys(req.body).forEach((field) => {
    if (allowedFields.includes(field)) {
      updateFields[field] = req.body[field];
    }
  });

  if (Object.keys(updateFields).length === 0) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: `Only the following fields can be updated: ${allowedFields.join(", ")}`
    });
  }

  const admin = await Admin.findOne({ _id: adminId, status: { $ne: "deleted" } });
  if (!admin) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Admin not found"
    });
  }

  if (updateFields.username) {
    updateFields.username = updateFields.username.toLowerCase();
    const usernameExists = await Admin.findOne({
      _id: { $ne: adminId },
      username: updateFields.username,
      status: { $ne: "deleted" }
    });
    if (usernameExists) {
      return responseHandler({
        res,
        code: statusCode.CONFLICT,
        message: "Username already exists"
      });
    }
  }

  if (updateFields.email) {
    updateFields.email = updateFields.email.toLowerCase();
    const emailExists = await Admin.findOne({
      _id: { $ne: adminId },
      email: updateFields.email,
      status: { $ne: "deleted" }
    });
    if (emailExists) {
      return responseHandler({
        res,
        code: statusCode.CONFLICT,
        message: "Email already exists"
      });
    }
  }

  if (updateFields.reportsTo) {
    if (String(updateFields.reportsTo) === String(admin._id)) {
      return responseHandler({
        res,
        code: statusCode.DATAMISSING,
        message: "Admin cannot report to self"
      });
    }

    const reportsToAdmin = await Admin.findOne({
      _id: updateFields.reportsTo,
      status: { $ne: "deleted" }
    });
    if (!reportsToAdmin) {
      return responseHandler({
        res,
        code: statusCode.RESULTNOTFOUND,
        message: "Reporting admin not found"
      });
    }
  }

  if (updateFields.permissions && !Array.isArray(updateFields.permissions)) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "permissions must be an array"
    });
  }

  const nextCountryCode = updateFields.countryCode || admin.countryCode;
  const nextMobileNumber = updateFields.mobileNumber || admin.mobileNumber;
  if (nextCountryCode && nextMobileNumber) {
    const mobileExists = await Admin.findOne({
      _id: { $ne: adminId },
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

  const previousReportsTo = admin.reportsTo ? String(admin.reportsTo) : null;
  const nextReportsTo = updateFields.reportsTo ? String(updateFields.reportsTo) : previousReportsTo;
  let isPasswordUpdated = false;

  if (updateFields.password) {
    const isSamePassword = await admin.comparePassword(updateFields.password);
    isPasswordUpdated = !isSamePassword;
  }

  Object.assign(admin, updateFields);
  if (isPasswordUpdated) {
    admin.devices = [];
  }
  await admin.save();

  if (previousReportsTo && previousReportsTo !== nextReportsTo) {
    await Admin.findByIdAndUpdate(previousReportsTo, {
      $pull: { managedAdmins: admin._id }
    });
  }

  if (nextReportsTo && previousReportsTo !== nextReportsTo) {
    await Admin.findByIdAndUpdate(nextReportsTo, {
      $addToSet: { managedAdmins: admin._id }
    });
  }

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Admin updated successfully",
    data: sanitizeAdmin(admin)
  });
});
exports.getAdminById = catchAsyncError(async (req, res) => {
  const admin = await Admin.findOne({
    _id: req.query.adminId,
    status: { $ne: "deleted" }
  })
    .select("-password -resetPasswordOTP -resetPasswordExpires")
    .populate("createdBy", "fullName email adminId role")
    .populate("reportsTo", "fullName email adminId role");

  if (!admin) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Admin not found"
    });
  }

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Admin retrieved successfully",
    data: admin
  });
});
exports.getAllSubAdmins = catchAsyncError(async (req, res) => {
  const admins = await Admin.find({ role: "sub_admin", status: { $ne: "deleted" } })
    .select("-password -resetPasswordOTP -resetPasswordExpires")
    .populate("createdBy", "fullName email adminId role")
    .populate("reportsTo", "fullName email adminId role")
    .sort({ createdAt: -1 });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Admins retrieved successfully",
    data: admins
  });
});
exports.updateAdminStatus = catchAsyncError(async (req, res) => {
  const { adminId } = req.query;
  const { status } = req.body;

  if (!status) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "status is required"
    });
  }

  if (!["active", "inactive", "suspended", "deleted"].includes(status)) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "status must be active, inactive, suspended or deleted"
    });
  }

  const admin = await Admin.findOne({ _id: adminId, status: { $ne: "deleted" } });
  if (!admin) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Admin not found"
    });
  }

  if (admin.role === "super_admin") {
    return responseHandler({
      res,
      code: statusCode.FORBIDDEN,
      message: "Super admin status cannot be changed from this API"
    });
  }

  admin.status = status;
  if (status !== "active") {
    admin.devices = [];
  }
  await admin.save();

  if (status === "deleted") {
    await Admin.findByIdAndUpdate(req.adminId, {
      $pull: { managedAdmins: admin._id }
    });
  }

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Admin status updated successfully",
    data: sanitizeAdmin(admin)
  });
});