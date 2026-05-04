const Admin = require("../../models/adminModel");
const { responseHandler } = require("../../utils/responseHandler");
const statusCode = require("../../utils/httpResponseCode");
const { catchAsyncError } = require("../../utils/generateError");
const { generateAdminToken } = require("../../utils/tokenUtils");
const { bcryptedPasswordFunc } = require("../../utils/bcryption");
const Manager = require("../../models/managerModel");

const normalizeCodePart = (value) =>
  (value || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const escapeRegex = (value) => value.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const getNextUserGeneralCode = async () => {
  const lastUser = await User.aggregate([
    { $match: { generalCode: { $regex: /^gen-\d+$/ } } },
    {
      $addFields: {
        numericGeneralCode: {
          $toInt: { $substr: ["$generalCode", 4, -1] }
        }
      }
    },
    { $sort: { numericGeneralCode: -1 } },
    { $limit: 1 }
  ]);

  const nextNumber = lastUser.length > 0 ? lastUser[0].numericGeneralCode + 1 : 1;
  return `gen-${String(nextNumber).padStart(3, "0")}`;
};
const getNextInfluencerCode = async () => {
  const last = await InfluencerDetails.aggregate([
    { $match: { influencerCode: { $regex: /^inf-\d+$/ } } },
    {
      $addFields: {
        numericInfluencerCode: {
          $toInt: { $substr: ["$influencerCode", 4, -1] }
        }
      }
    },
    { $sort: { numericInfluencerCode: -1 } },
    { $limit: 1 }
  ]);

  const nextNumber = last.length > 0 ? last[0].numericInfluencerCode + 1 : 1;
  return `inf-${String(nextNumber).padStart(3, "0")}`;
};
const getNextPartnerManagerCode = async ({ district, capital }) => {
  const normalizedDistrict = normalizeCodePart(district);
  const normalizedCapital = normalizeCodePart(capital);
  const base = `PNR${normalizedDistrict}${normalizedCapital}`;

  const candidates = await PartnerDetails.find({
    partnerCode: { $regex: new RegExp(`^${escapeRegex(base)}\\d+$`) }
  }).select("partnerCode").lean();

  let max = 0;
  for (const row of candidates) {
    const match = (row.partnerCode || "").match(new RegExp(`^${escapeRegex(base)}(\\d+)$`));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }

  return `${base}${max + 1}`;
};
const getNextAgencyCode = async ({ district, capital }) => {
  const normalizedDistrict = normalizeCodePart(district);
  const normalizedCapital = normalizeCodePart(capital);
  const base = `AGN${normalizedDistrict}${normalizedCapital}`;

  const candidates = await PartnerDetails.find({
    partnerCode: { $regex: new RegExp(`^${escapeRegex(base)}\\d{4}$`) }
  }).select("partnerCode").lean();

  let max = 0;
  for (const row of candidates) {
    const match = (row.partnerCode || "").match(new RegExp(`^${escapeRegex(base)}(\\d{4})$`));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }

  return `${base}${String(max + 1).padStart(4, "0")}`;
};
const getNextAssociateCode = async (baseCode) => {
  const candidates = await PartnerDetails.find({
    partnerCode: { $regex: new RegExp(`^${escapeRegex(baseCode)}-\\d{4}$`) }
  }).select("partnerCode").lean();

  let max = 0;
  for (const row of candidates) {
    const match = (row.partnerCode || "").match(new RegExp(`^${escapeRegex(baseCode)}-(\\d{4})$`));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }

  return `${baseCode}-${String(max + 1).padStart(4, "0")}`;
};
const sanitizeAdmin = (admin) => {
  const adminData = admin.toObject ? admin.toObject() : { ...admin };
  delete adminData.password;
  delete adminData.resetPasswordOTP;
  delete adminData.resetPasswordExpires;
  return adminData;
};

const normalizeTrim = (value) => (value === undefined || value === null ? "" : value.toString().trim());
const normalizeEmail = (value) => normalizeTrim(value).toLowerCase();
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

const getNextManagerId = async (managerType) => {
  const prefix = managerType === "agency_manager" ? "AM" : "PM";
  const last = await Manager.aggregate([
    { $match: { managerId: { $regex: new RegExp(`^${prefix}-\\d+$`) } } },
    {
      $addFields: {
        numericManagerId: {
          $toInt: { $substr: ["$managerId", 3, -1] }
        }
      }
    },
    { $sort: { numericManagerId: -1 } },
    { $limit: 1 }
  ]);

  const nextNumber = last.length > 0 ? last[0].numericManagerId + 1 : 1;
  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
};
const getNextPartnerManagerCodeForManager = async ({ district, capital }) => {
  const normalizedDistrict = normalizeCodePart(district);
  const normalizedCapital = normalizeCodePart(capital);
  const base = `PNR${normalizedDistrict}${normalizedCapital}`;

  const candidates = await Manager.find({
    managerType: "partner_manager",
    partnerCode: { $regex: new RegExp(`^${escapeRegex(base)}\\d+$`) }
  }).select("partnerCode").lean();

  let max = 0;
  for (const row of candidates) {
    const match = (row.partnerCode || "").match(new RegExp(`^${escapeRegex(base)}(\\d+)$`));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }

  return `${base}${max + 1}`;
};
const getNextAgencyCodeForManager = async ({ district, capital }) => {
  const normalizedDistrict = normalizeCodePart(district);
  const normalizedCapital = normalizeCodePart(capital);
  const base = `AGN${normalizedDistrict}${normalizedCapital}`;

  const candidates = await Manager.find({
    managerType: "agency_manager",
    partnerCode: { $regex: new RegExp(`^${escapeRegex(base)}\\d{4}$`) }
  }).select("partnerCode").lean();

  let max = 0;
  for (const row of candidates) {
    const match = (row.partnerCode || "").match(new RegExp(`^${escapeRegex(base)}(\\d{4})$`));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }

  return `${base}${String(max + 1).padStart(4, "0")}`;
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
//--------------------------------------------------------------------------------------
exports.getPartnerRequests = catchAsyncError(async (req, res) => {
  const status = (req.query.status || "pending").toString().trim().toLowerCase();
  if (!["pending", "approved", "rejected"].includes(status)) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "status must be one of: pending, approved, rejected",
    });
  }

  const requests = await PartnerDetails.find({ verificationStatus: status })
    .populate("userId", "username email shortId generalCode activeCode activeCodeType countryCode mobileNumber roles status")
    .sort({ updatedAt: -1 });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Partner requests fetched successfully",
    data: requests,
  });
});
exports.verifyPartner = catchAsyncError(async (req, res) => {
  const { partnerId, isVerified, rejectionReason } = req.body;
  if (!partnerId) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "partnerId is required"
    });
  }

  const partner = await PartnerDetails.findById(partnerId).populate("userId", "username email shortId");
  if (!partner) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Partner record not found"
    });
  }

  const verify = isVerified === undefined ? true : Boolean(isVerified);
  if (verify) {
    const targetUserId = partner.userId && partner.userId._id ? partner.userId._id : partner.userId;
    const foundUser = await User.findById(targetUserId);
    if (!foundUser) {
      return responseHandler({
        res,
        code: statusCode.RESULTNOTFOUND,
        message: "User not found for this partner record",
      });
    }

    if (Array.isArray(foundUser.roles) && foundUser.roles.includes("influencer")) {
      return responseHandler({
        res,
        code: statusCode.CONFLICT,
        message: "User is already an influencer. Only one role at a time is allowed.",
      });
    }

    if (!foundUser.generalCode) {
      foundUser.generalCode = await getNextUserGeneralCode();
    }
    if (!foundUser.activeCode) {
      foundUser.activeCode = foundUser.generalCode;
      foundUser.activeCodeType = "general";
    }

    if (!partner.partnerCode) {
      if (partner.partnerCategory === "agency") {
        if (!partner.district || !partner.capital) {
          return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "district and capital are required to generate agency code",
          });
        }
        partner.partnerCode = await getNextAgencyCode({
          district: partner.district,
          capital: partner.capital,
        });
      } else if (partner.partnerType === "manager_associate") {
        if (!partner.managerCode) {
          return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "managerCode is required to generate partner associate code",
          });
        }
        partner.partnerCode = await getNextAssociateCode(partner.managerCode);
      } else if (partner.partnerType === "agency_associate") {
        if (!partner.agencyCode) {
          return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "agencyCode is required to generate agency associate code",
          });
        }
        partner.partnerCode = await getNextAssociateCode(partner.agencyCode);
      } else {
        if (!partner.district || !partner.capital) {
          return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "district and capital are required to generate partner manager code",
          });
        }
        partner.partnerCode = await getNextPartnerManagerCode({
          district: partner.district,
          capital: partner.capital,
        });
      }
    }

    partner.isVerified = true;
    partner.verificationStatus = "approved";
    partner.reviewedBy = req.adminId;
    partner.reviewedAt = new Date();
    partner.rejectionReason = null;
    await partner.save();

    const roles = Array.isArray(foundUser.roles) ? foundUser.roles : ["user"];
    if (!roles.includes("partner")) roles.push("partner");
    foundUser.roles = roles;
    foundUser.activeCode = partner.partnerCode;
    foundUser.activeCodeType = "partner";
    await foundUser.save();
  } else {
    partner.isVerified = false;
    partner.verificationStatus = "rejected";
    partner.reviewedBy = req.adminId;
    partner.reviewedAt = new Date();
    partner.rejectionReason = rejectionReason ? rejectionReason.toString().trim() : "Rejected by admin";
    await partner.save();
  }

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Partner verification status updated",
    data: partner
  });
});
exports.getInfluencerRequests = catchAsyncError(async (req, res) => {
  const status = (req.query.status || "pending").toString().trim().toLowerCase();
  if (!["pending", "approved", "rejected"].includes(status)) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "status must be one of: pending, approved, rejected",
    });
  }

  const requests = await InfluencerDetails.find({ verificationStatus: status })
    .populate("userId", "username email shortId generalCode activeCode activeCodeType countryCode mobileNumber roles status")
    .sort({ updatedAt: -1 });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Influencer requests fetched successfully",
    data: requests,
  });
});
exports.verifyInfluencer = catchAsyncError(async (req, res) => {
  const { influencerId, isVerified, rejectionReason } = req.body;
  if (!influencerId) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "influencerId is required"
    });
  }

  const influencer = await InfluencerDetails.findById(influencerId).populate("userId", "username email shortId");
  if (!influencer) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Influencer record not found"
    });
  }

  const verify = isVerified === undefined ? true : Boolean(isVerified);
  if (verify) {
    const targetUserId = influencer.userId && influencer.userId._id ? influencer.userId._id : influencer.userId;
    const foundUser = await User.findById(targetUserId);
    if (!foundUser) {
      return responseHandler({
        res,
        code: statusCode.RESULTNOTFOUND,
        message: "User not found for this influencer record",
      });
    }

    if (Array.isArray(foundUser.roles) && foundUser.roles.includes("partner")) {
      return responseHandler({
        res,
        code: statusCode.CONFLICT,
        message: "User is already a partner. Only one role at a time is allowed.",
      });
    }

    if (!foundUser.generalCode) {
      foundUser.generalCode = await getNextUserGeneralCode();
    }
    if (!foundUser.activeCode) {
      foundUser.activeCode = foundUser.generalCode;
      foundUser.activeCodeType = "general";
    }

    if (!influencer.influencerCode) {
      influencer.influencerCode = await getNextInfluencerCode();
    }

    influencer.isVerified = true;
    influencer.verificationStatus = "approved";
    influencer.reviewedBy = req.adminId;
    influencer.reviewedAt = new Date();
    influencer.rejectionReason = null;
    await influencer.save();

    const roles = Array.isArray(foundUser.roles) ? foundUser.roles : ["user"];
    if (!roles.includes("influencer")) roles.push("influencer");
    foundUser.roles = roles;
    foundUser.activeCode = influencer.influencerCode;
    foundUser.activeCodeType = "influencer";
    await foundUser.save();
  } else {
    influencer.isVerified = false;
    influencer.verificationStatus = "rejected";
    influencer.reviewedBy = req.adminId;
    influencer.reviewedAt = new Date();
    influencer.rejectionReason = rejectionReason ? rejectionReason.toString().trim() : "Rejected by admin";
    await influencer.save();
  }

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Influencer verification status updated",
    data: influencer
  });
});


exports.createPartnerManager = catchAsyncError(async (req, res) => {
  const {
    username,
    fullname,
    email,
    countryCode,
    mobileNumber,
    password,
    profileImage,
    dob,
    gender,
    state,
    district,
    capital,
    aadharResponse,
    panNo,
    panCardName,
    bankAccountNumber,
    bankIFSC,
    bankHolderName,
    bankName,
    upiId
  } = req.body;

  if (!username || !fullname || !email || !countryCode || !mobileNumber || !password || !state || !district || !capital) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "username, fullname, email, countryCode, mobileNumber, password, state, district and capital are required",
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedCountryCode = normalizeTrim(countryCode);
  const normalizedMobileNumber = normalizeTrim(mobileNumber);
  const normalizedUsername = normalizeTrim(username).toLowerCase();

  const existing = await Manager.findOne({
    $or: [
      { username: normalizedUsername },
      { email: normalizedEmail },
      { countryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber }
    ],
    status: { $ne: "deleted" }
  });

  if (existing) {
    let conflictField = "Manager";
    if (existing.username === normalizedUsername) conflictField = "Username";
    else if ((existing.email || "").toLowerCase() === normalizedEmail) conflictField = "Email";
    else conflictField = "Mobile number";

    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: `${conflictField} already exists`,
    });
  }

  const managerId = await getNextManagerId("partner_manager");
  const partnerCode = await getNextPartnerManagerCodeForManager({ district, capital });

  const newManager = await Manager.create({
    managerId,
    partnerCode,
    managerType: "partner_manager",
    username: normalizedUsername,
    fullname: normalizeTrim(fullname),
    email: normalizedEmail,
    countryCode: normalizedCountryCode,
    mobileNumber: normalizedMobileNumber,
    password, // ManagerSchema pre-save will hash
    profileImage,
    dob,
    gender,
    state: normalizeTrim(state),
    district: normalizeTrim(district),
    capital: normalizeTrim(capital),
    panNo,
    panCardName,
    aadharResponse,
    bankAccountNumber,
    bankIFSC,
    bankHolderName,
    bankName,
    upiId,
    status: "active",
    createdBy: req.adminId,
  });

  return responseHandler({
    res,
    code: statusCode.CREATED,
    message: "Partner manager created successfully",
    data: {
      managerId: newManager._id,
      managerCode: newManager.partnerCode,
      recordId: newManager.managerId,
    },
  });
});
exports.createAgencyManager = catchAsyncError(async (req, res) => {
  const {
    username,
    fullname,
    email,
    countryCode,
    mobileNumber,
    password,
    profileImage,
    dob,
    gender,
    state,
    district,
    capital,
    panNo,
    panCardName,
    aadharResponse,
    bankAccountNumber,
    bankIFSC,
    bankHolderName,
    bankName,
    upiId
  } = req.body;

  if (!username || !fullname || !email || !countryCode || !mobileNumber || !password || !state || !district || !capital) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "username, fullname, email, countryCode, mobileNumber, password, state, district and capital are required",
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedCountryCode = normalizeTrim(countryCode);
  const normalizedMobileNumber = normalizeTrim(mobileNumber);
  const normalizedUsername = normalizeTrim(username).toLowerCase();

  const existing = await Manager.findOne({
    $or: [
      { username: normalizedUsername },
      { email: normalizedEmail },
      { countryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber }
    ],
    status: { $ne: "deleted" }
  });

  if (existing) {
    let conflictField = "Manager";
    if (existing.username === normalizedUsername) conflictField = "Username";
    else if ((existing.email || "").toLowerCase() === normalizedEmail) conflictField = "Email";
    else conflictField = "Mobile number";

    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: `${conflictField} already exists`,
    });
  }

  const managerId = await getNextManagerId("agency_manager");
  const partnerCode = await getNextAgencyCodeForManager({ district, capital });

  const newManager = await Manager.create({
    managerId,
    partnerCode,
    managerType: "agency_manager",
    username: normalizedUsername,
    fullname: normalizeTrim(fullname),
    email: normalizedEmail,
    countryCode: normalizedCountryCode,
    mobileNumber: normalizedMobileNumber,
    password, // ManagerSchema pre-save will hash
    profileImage,
    dob,
    gender,
    state: normalizeTrim(state),
    district: normalizeTrim(district),
    capital: normalizeTrim(capital),
    panNo,
    panCardName,
    aadharResponse,
    bankAccountNumber,
    bankIFSC,
    bankHolderName,
    bankName,
    upiId,
    status: "active",
    createdBy: req.adminId,
  });

  return responseHandler({
    res,
    code: statusCode.CREATED,
    message: "Agency manager created successfully",
    data: {
      managerId: newManager._id,
      agencyCode: newManager.partnerCode,
      recordId: newManager.managerId,
    },
  });
});
exports.listPartnerManagers = catchAsyncError(async (req, res) => {
  const { state, district, capital, status } = req.query;
  const filter = { managerType: "partner_manager", status: { $ne: "deleted" } };
  if (status) filter.status = normalizeTrim(status);
  if (state) filter.state = normalizeTrim(state);
  if (district) filter.district = normalizeTrim(district);
  if (capital) filter.capital = normalizeTrim(capital);

  const managers = await Manager.find(filter)
    .select("-password -resetPasswordOTP -resetPasswordExpires")
    .sort({ createdAt: -1 });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Partner managers fetched successfully",
    data: managers,
  });
});
exports.listAgencyManagers = catchAsyncError(async (req, res) => {
  const { state, district, capital, status } = req.query;
  const filter = { managerType: "agency_manager", status: { $ne: "deleted" } };
  if (status) filter.status = normalizeTrim(status);
  if (state) filter.state = normalizeTrim(state);
  if (district) filter.district = normalizeTrim(district);
  if (capital) filter.capital = normalizeTrim(capital);

  const managers = await Manager.find(filter)
    .select("-password -resetPasswordOTP -resetPasswordExpires")
    .sort({ createdAt: -1 });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Agency managers fetched successfully",
    data: managers,
  });
});
exports.listAllManagers = catchAsyncError(async (req, res) => {
  const { managerType, state, district, status } = req.query;

  const filter = { status: { $ne: "deleted" } };

  if (managerType) filter.managerType = managerType;
  if (state) filter.state = normalizeTrim(state);
  if (district) filter.district = normalizeTrim(district);
  if (status) filter.status = normalizeTrim(status);

  const managers = await Manager.find(filter)
    .select("-password -resetPasswordOTP -resetPasswordExpires")
    .sort({ createdAt: -1 });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Managers retrieved successfully",
    data: managers
  });
});
//get partner or agency manager details by id
exports.getManagerById = catchAsyncError(async (req, res) => {
  const { managerId } = req.query;

  const manager = await Manager.findOne({ _id: managerId, status: { $ne: "deleted" } })
    .select("-password -resetPasswordOTP -resetPasswordExpires")
    .populate("createdBy", "fullName email adminId");

  if (!manager) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "Manager not found"
    });
  }

  // Get associates count using manager reference
  const partnerType = manager.managerType === "partner_manager" ? "manager_associate" : "agency_associate";
  const managerField = manager.managerType === "partner_manager" ? "managerCode" : "agencyCode";

  const associatesCount = await PartnerDetails.countDocuments({
    [managerField]: manager.partnerCode,
    partnerType: partnerType,
    verificationStatus: "approved"
  });

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Manager retrieved successfully",
    data: {
      ...manager.toObject(),
      associatesCount: associatesCount
    }
  });
});