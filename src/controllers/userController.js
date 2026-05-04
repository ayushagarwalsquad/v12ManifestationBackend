const user = require("../models/userModel");
const Manager = require("../models/managerModel");
const Wallet = require("../models/walletModel");
const PartnerDetails = require("../models/partnerDetailsModel");
const InfluencerDetails = require("../models/influencerDetailsModel");
const VerificationOtp = require("../models/verificationOtpModel");
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");
const { catchAsyncError } = require("../utils/generateError.js");
const { bcryptedPasswordFunc, verifyPassword } = require("../utils/bcryption");
const { generateUserToken } = require("../utils/tokenUtils");

const normalizeTrim = (value) => (value === undefined || value === null ? "" : value.toString().trim());
const normalizeEmail = (value) => normalizeTrim(value).toLowerCase();
const resolveApprovedPartnerManagerByCode = async (managerCode) => {
  const code = normalizeTrim(managerCode);
  if (!code) return null;

  return Manager.findOne({
    partnerCode: code,
    managerType: "partner_manager",
    status: "active"
  }).select("_id partnerCode").lean();
};
const resolveApprovedAgencyManagerByCode = async (agencyCode) => {
  const code = normalizeTrim(agencyCode);
  if (!code) return null;

  return Manager.findOne({
    partnerCode: code,
    managerType: "agency_manager",
    status: "active"
  }).select("_id partnerCode").lean();
};
const getNextShortId = async () => {
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

  return lastUser.length > 0 ? `U-${lastUser[0].numericShortId + 1}` : "U-1";
};
const getNextGeneralCode = async () => {
  const lastUser = await user.aggregate([
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
const applyWelcomeBonusAndCodes = async (userDoc) => {
  // WELCOME BONUS
  if (!userDoc.isWelcomeBonusGiven) {
    // extra safety (double protection)
    const existingBonus = await Wallet.findOne({
      userId: userDoc._id,
      reason: "welcome_bonus"
    });

    if (!existingBonus) {
      userDoc.walletBalance = (userDoc.walletBalance || 0) + 50;
      userDoc.isWelcomeBonusGiven = true;

      await Wallet.create({
        userId: userDoc._id,
        amount: 50,
        type: "credit",
        reason: "welcome_bonus",
        balanceAfter: userDoc.walletBalance
      });
    }
  }

  if (!userDoc.generalCode) {
    userDoc.generalCode = await getNextGeneralCode();
  }
  if (!userDoc.activeCode) {
    userDoc.activeCode = userDoc.generalCode;
    userDoc.activeCodeType = "general";
  }

  await userDoc.save();
};

exports.sendOtp = catchAsyncError(async (req, res) => {
  const { email, countryCode, mobileNumber } = req.body;
  if (!email || !countryCode || !mobileNumber) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "email, countryCode and mobileNumber are required",
    });
  }

  const normalizedEmail = email.toString().trim().toLowerCase();
  const normalizedCountryCode = countryCode.toString().trim();
  const normalizedMobileNumber = mobileNumber.toString().trim();

  //find any user with same email or mobile
  const existingUser = await user.findOne({
    $or: [
      { email: normalizedEmail },
      { countryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber }
    ]
  });

  if (existingUser) {
    //BLOCKED CASE (highest priority)
    if (existingUser.status === "blocked") {
      return responseHandler({
        res,
        code: statusCode.FORBIDDEN,
        message: "Your account has been blocked"
      });
    }

    //ACTIVE USER (already exists)
    if (existingUser.status !== "deleted") {
      let conflictField = "";

      if ((existingUser.email || "").toLowerCase() === normalizedEmail) {
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
    //if deleted hai → allow OTP (re-register case)
  }

  //Generate OTP (4 digits)
  const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();
  const emailOtp = generateOtp();
  const mobileOtp = generateOtp();

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "OTP generated successfully",
    data: {
      email: normalizedEmail,
      mobileNumber: normalizedCountryCode + normalizedMobileNumber,
      emailOtp,
      mobileOtp,
    },
  });
});
exports.createAccount = catchAsyncError(async (req, res) => {
  const {
    countryCode,
    mobileNumber,
    username,
    fullname,
    email,
    password,
    dob,
    gender,
    profileImage
  } = req.body;
  if (!countryCode || !mobileNumber || !username || !fullname || !email || !password || !dob || !gender) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Required fields missing"
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedCountryCode = normalizeTrim(countryCode);
  const normalizedMobileNumber = normalizeTrim(mobileNumber);

  const existingUserQuery = {
    $or: [
      { username },
      { email: normalizedEmail },
      { countryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber }
    ],
    status: { $ne: "deleted" }
  };

  const existingUser = await user.findOne(existingUserQuery);

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
    } else if ((existingUser.email || "").toLowerCase() === normalizedEmail) {
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

  // Username check (ignore deleted users)
  const usernameTaken = await user.findOne({
    username,
    status: { $ne: "deleted" }
  });
  if (usernameTaken) {
    if (usernameTaken.status === "blocked") {
      return responseHandler({
        res,
        code: statusCode.FORBIDDEN,
        message: "Your account has been blocked"
      });
    }
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "Username already exists"
    });
  }
  // Create new user always
  const newShortId = await getNextShortId();
  const hashedPassword = await bcryptedPasswordFunc(password);

  // NEW USER
  const userData = await user.create({
    shortId: newShortId,
    countryCode: normalizedCountryCode,
    mobileNumber: normalizedMobileNumber,
    username,
    fullname,
    email: normalizedEmail,
    password: hashedPassword,
    dob,
    gender,
    profileImage,
    roles: ["user"],
    status: "active",
    walletBalance: 0,
    isWelcomeBonusGiven: false
  });
  await applyWelcomeBonusAndCodes(userData);

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

  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials",
    });
  }

  const isPasswordValid = await verifyPassword(password, foundUser.password);
  if (!isPasswordValid) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials",
    });
  }


  let loginAs = "user";
  let resolvedInfluencerId = null;
  const influencerProfile = await InfluencerDetails.findOne({ userId: foundUser._id });

  if (influencerProfile) {
    resolvedInfluencerId = influencerProfile._id;

    if (influencerProfile.verificationStatus === "approved" && influencerProfile.isVerified) {
      loginAs = "influencer";

      foundUser.activeCode = influencerProfile.influencerCode;
      foundUser.activeCodeType = "influencer";

    } else if (influencerProfile.verificationStatus === "pending") {
      loginAs = "pending_influencer";

    } else if (influencerProfile.verificationStatus === "rejected") {
      loginAs = "rejected_influencer";
    }
  } else {
    if (foundUser.generalCode) {
      foundUser.activeCode = foundUser.generalCode;
      foundUser.activeCodeType = "general";
    }
  }

  if (agreedToTerms && foundUser.agreeToTerms !== true) {
    foundUser.agreeToTerms = true;
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
    data: {
      token,
      loginAs,
      roles: foundUser.roles,
      influencerId: resolvedInfluencerId,
      activeCode: foundUser.activeCode,
      activeCodeType: foundUser.activeCodeType,
    },
  });
});
exports.partnerLogin = catchAsyncError(async (req, res) => {
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

  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials",
    });
  }

  const isPasswordValid = await verifyPassword(password, foundUser.password);
  if (!isPasswordValid) {
    return responseHandler({
      res,
      code: statusCode.UNAUTHORIZED,
      message: "Invalid credentials",
    });
  }

  const partnerProfile = await PartnerDetails.findOne({ userId: foundUser._id }).sort({ createdAt: -1 });
  if (!partnerProfile) {
    return responseHandler({
      res,
      code: statusCode.FORBIDDEN,
      message: "This account is not registered as partner",
    });
  }

  if (partnerProfile.verificationStatus !== "approved" || partnerProfile.isVerified !== true) {
    const status = partnerProfile.verificationStatus || "pending";
    const message =
      status === "rejected"
        ? `Partner request rejected${partnerProfile.rejectionReason ? `: ${partnerProfile.rejectionReason}` : ""}`
        : "Partner request is not approved yet";

    return responseHandler({
      res,
      code: statusCode.FORBIDDEN,
      message,
      data: { verificationStatus: status },
    });
  }

  if (!partnerProfile.partnerCode) {
    return responseHandler({
      res,
      code: statusCode.ERROR,
      message: "Partner code is not generated yet. Please contact support.",
    });
  }

  foundUser.activeCode = partnerProfile.partnerCode;
  foundUser.activeCodeType = "partner";

  if (agreedToTerms && foundUser.agreeToTerms !== true) {
    foundUser.agreeToTerms = true;
  }

  const token = generateUserToken(foundUser);

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
    message: "Partner login successful",
    data: {
      token,
      loginAs: "partner",
      roles: foundUser.roles,
      partnerId: partnerProfile._id,
      activeCode: foundUser.activeCode,
      activeCodeType: foundUser.activeCodeType,
    },
  });
});
exports.registerInfluencer = catchAsyncError(async (req, res) => {
  const {
    countryCode,
    mobileNumber,
    username,
    fullname,
    email,
    password,
    dob,
    gender,
    profileImage,
    instaId,
    facebookId
  } = req.body;

  if (!countryCode || !mobileNumber || !username || !fullname || !email || !password || !dob || !gender || !instaId || !facebookId) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Required fields missing",
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedCountryCode = normalizeTrim(countryCode);
  const normalizedMobileNumber = normalizeTrim(mobileNumber);

  const existingUserQuery = {
    $or: [
      { username },
      { email: normalizedEmail },
      { countryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber }
    ],
    status: { $ne: "deleted" }
  };

  const existingUser = await user.findOne(existingUserQuery);

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
    } else if ((existingUser.email || "").toLowerCase() === normalizedEmail) {
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

  // Username check (ignore deleted users)
  const usernameTaken = await user.findOne({
    username,
    status: { $ne: "deleted" }
  });
  if (usernameTaken) {
    if (usernameTaken.status === "blocked") {
      return responseHandler({
        res,
        code: statusCode.FORBIDDEN,
        message: "Your account has been blocked"
      });
    }
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "Username already exists"
    });
  }
  // Create new user always
  const newShortId = await getNextShortId();
  const hashedPassword = await bcryptedPasswordFunc(password);
  const resolvedFullname = normalizeTrim(fullname) || normalizeTrim(username);

  // NEW USER
  const userData = await user.create({
    shortId: newShortId,
    countryCode: normalizedCountryCode,
    mobileNumber: normalizedMobileNumber,
    username,
    fullname: resolvedFullname,
    email: normalizedEmail,
    password: hashedPassword,
    dob,
    gender,
    profileImage,
    roles: ["user"],
    status: "active",
    walletBalance: 0,
    isWelcomeBonusGiven: false
  });

  await applyWelcomeBonusAndCodes(userData);

  const existingPartnerReq = await PartnerDetails.findOne({
    userId: userData._id,
    verificationStatus: "pending",
  });
  if (existingPartnerReq) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "You already have a pending partner enrollment request",
    });
  }

  let influencerDetail = await InfluencerDetails.findOne({ userId: userData._id });

  if (influencerDetail && influencerDetail.verificationStatus === "approved") {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "Your influencer profile is already approved",
    });
  }

  if (!influencerDetail) {
    influencerDetail = new InfluencerDetails({ userId: userData._id });
  }

  influencerDetail.instaId = instaId;
  influencerDetail.facebookId = facebookId;
  influencerDetail.isVerified = false;
  influencerDetail.verificationStatus = "pending";

  await influencerDetail.save();

  return responseHandler({
    res,
    code: statusCode.CREATED,
    message: "Influencer account created. Admin will review within 24 hours.",
    data: {
      userId: userData._id,
      influencerId: influencerDetail._id,
      verificationStatus: influencerDetail.verificationStatus,
    },
  });
});
exports.registerPartner = catchAsyncError(async (req, res) => {
  const {
    partnerCategory,
    partnerType,
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
    managerCode,
    agencyCode
  } = req.body;

  if (!username || !email || !countryCode || !mobileNumber || !password || !profileImage || !dob || !gender || !panCardName || !panNo || !partnerCategory) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "Required fields missing",
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedCountryCode = normalizeTrim(countryCode);
  const normalizedMobileNumber = normalizeTrim(mobileNumber);

  const normalizedPartnerCategory = (partnerCategory || "").toString().trim().toLowerCase();
  if (normalizedPartnerCategory !== "partner") {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "partnerCategory must be 'partner'",
    });
  }

  const normalizedPartnerType = partnerType ? partnerType.toString().trim().toLowerCase() : null;
  if (normalizedPartnerType && !["manager_associate", "agency_associate"].includes(normalizedPartnerType)) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "partnerType must be manager_associate or agency_associate",
    });
  }

  if (normalizedPartnerType === "manager_associate" && !managerCode) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "managerCode is required for manager associates",
    });
  }

  if (normalizedPartnerType === "agency_associate" && !agencyCode) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "agencyCode is required for agency associates",
    });
  }

  const existingUserQuery = {
    $or: [
      { username },
      { email: normalizedEmail },
      { countryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber }
    ],
    status: { $ne: "deleted" }
  };
  const existingUser = await user.findOne(existingUserQuery);

  if (existingUser) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "User already exists",
    });
  }

  const newShortId = await getNextShortId();
  const hashedPassword = await bcryptedPasswordFunc(password);
  const resolvedFullname = normalizeTrim(fullname) || normalizeTrim(username);


  const createdUser = await user.create({
    shortId: newShortId,
    username,
    fullname: resolvedFullname,
    email: normalizedEmail,
    countryCode: normalizedCountryCode,
    mobileNumber: normalizedMobileNumber,
    password: hashedPassword,
    profileImage,
    dob,
    gender,
    roles: ["user"],
    status: "active"
  });

  // partner registration should NOT receive welcome bonus or general codes here
  // partner-specific code will be assigned later after admin approval

  // Block if already pending/approved
  const existingPartner = await PartnerDetails.findOne({
    userId: createdUser._id,
    verificationStatus: { $in: ["pending", "approved"] }
  });

  if (existingPartner) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message:
        existingPartner.verificationStatus === "approved"
          ? "Partner already approved"
          : "Partner request already pending",
    });
  }

  // VALIDATE MANAGER / AGENCY CODE
  let finalManagerCode = null;
  let finalAgencyCode = null;

  if (normalizedPartnerType === "manager_associate") {
    const manager = await resolveApprovedPartnerManagerByCode(managerCode);

    if (!manager) {
      return responseHandler({
        res,
        code: statusCode.DATAMISSING,
        message: "Invalid managerCode",
      });
    }
    finalManagerCode = manager.partnerCode;
  }

  if (normalizedPartnerType === "agency_associate") {
    const agency = await resolveApprovedAgencyManagerByCode(agencyCode);

    if (!agency) {
      return responseHandler({
        res,
        code: statusCode.DATAMISSING,
        message: "Invalid agencyCode",
      });
    }
    finalAgencyCode = agency.partnerCode;
  }
  // ✅ ALWAYS create new PartnerDetails (no reuse)
  const partnerDetail = await PartnerDetails.create({
    userId: createdUser._id,
    panNo,
    panCardName,
    state,
    district,
    capital,
    aadharResponse,
    partnerCategory: normalizedPartnerCategory,
    partnerType: normalizedPartnerType,
    managerCode: finalManagerCode,
    agencyCode: finalAgencyCode,
    isVerified: false,
    verificationStatus: "pending"
  });

  return responseHandler({
    res,
    code: statusCode.CREATED,
    message: "Partner account created. Admin will review within 24 hours.",
    data: {
      userId: createdUser._id,
      partnerId: partnerDetail._id,
      verificationStatus: partnerDetail.verificationStatus,
    },
  });
});
exports.requestPartnerEnrollment = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const foundUser = req.user || await user.findById(userId);

  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found",
    });
  }

  if (Array.isArray(foundUser.roles) && (foundUser.roles.includes("partner") || foundUser.roles.includes("influencer"))) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "You can enroll only one role at a time (partner OR influencer)",
    });
  }

  const {
    state,
    district,
    capital,
    panNo,
    panCardName,
    partnerCategory,
    partnerType,
    managerCode,
    agencyCode,
    aadharResponse
  } = req.body;

  const resolvedState = state || (location && location.state);
  const resolvedDistrict = district || (location && location.district);
  const resolvedCapital = capital || (location && location.capital);

  const normalizedPartnerCategoryRaw = (partnerCategory || "partner").toString().trim().toLowerCase();
  if (normalizedPartnerCategoryRaw !== "partner") {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "partnerCategory must be partner",
    });
  }
  const normalizedPartnerType = partnerType ? partnerType.toString().trim().toLowerCase() : "";
  if (!["manager_associate", "agency_associate"].includes(normalizedPartnerType)) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "partnerType must be manager_associate or agency_associate",
    });
  }
  if (!panNo || !panCardName || !resolvedState || !resolvedDistrict || !resolvedCapital) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "panNo, panCardName and state/district/capital are required",
    });
  }

  const existingInfluencerReq = await InfluencerDetails.findOne({
    userId: foundUser._id,
    verificationStatus: "pending",
  });
  if (existingInfluencerReq) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "You already have a pending influencer enrollment request",
    });
  }

  let partnerDetail = await PartnerDetails.findOne({ userId: foundUser._id });
  if (partnerDetail && partnerDetail.verificationStatus === "approved") {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "Your partner profile is already approved",
    });
  }
  if (!partnerDetail) {
    partnerDetail = new PartnerDetails({ userId: foundUser._id });
  }

  const normalizedManagerCode = normalizeTrim(managerCode);
  const normalizedAgencyCode = normalizeTrim(agencyCode);

  let finalManagerCode = null;
  let finalAgencyCode = null;

  if (normalizedPartnerType === "manager_associate") {
    if (!normalizedManagerCode) {
      return responseHandler({
        res,
        code: statusCode.DATAMISSING,
        message: "managerCode is required for manager associates",
      });
    }

    const manager = await resolveApprovedPartnerManagerByCode(normalizedManagerCode);
    if (!manager) {
      return responseHandler({
        res,
        code: statusCode.DATAMISSING,
        message: "Invalid managerCode",
      });
    }

    finalManagerCode = manager.partnerCode;
  }

  if (normalizedPartnerType === "agency_associate") {
    if (!normalizedAgencyCode) {
      return responseHandler({
        res,
        code: statusCode.DATAMISSING,
        message: "agencyCode is required for agency associates",
      });
    }

    const agency = await resolveApprovedAgencyManagerByCode(normalizedAgencyCode);
    if (!agency) {
      return responseHandler({
        res,
        code: statusCode.DATAMISSING,
        message: "Invalid agencyCode",
      });
    }

    finalAgencyCode = agency.partnerCode;
  }

  partnerDetail.panNo = panNo;
  partnerDetail.panCardName = panCardName;
  partnerDetail.aadharResponse = aadharResponse ? aadharResponse.toString() : undefined;
  partnerDetail.state = resolvedState;
  partnerDetail.district = resolvedDistrict;
  partnerDetail.capital = resolvedCapital;
  partnerDetail.partnerCategory = "partner";
  partnerDetail.partnerType = normalizedPartnerType;
  partnerDetail.managerCode = finalManagerCode;
  partnerDetail.agencyCode = finalAgencyCode;
  partnerDetail.isVerified = false;
  partnerDetail.verificationStatus = "pending";

  await partnerDetail.save();

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Partner enrollment request submitted. Admin will review within 24 hours.",
    data: {
      partnerId: partnerDetail._id,
      verificationStatus: partnerDetail.verificationStatus,
    },
  });
});
exports.requestInfluencerEnrollment = catchAsyncError(async (req, res) => {
  const userId = req.userId || (req.user && req.user._id);
  const foundUser = req.user || await user.findById(userId);

  if (!foundUser) {
    return responseHandler({
      res,
      code: statusCode.RESULTNOTFOUND,
      message: "User not found",
    });
  }

  if (Array.isArray(foundUser.roles) && (foundUser.roles.includes("partner") || foundUser.roles.includes("influencer"))) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "You can enroll only one role at a time (partner OR influencer)",
    });
  }

  const { instaId, facebookId, state, district, capital, location } = req.body;
  const resolvedState = state || (location && location.state);
  const resolvedDistrict = district || (location && location.district);
  const resolvedCapital = capital || (location && location.capital);

  if (!instaId || !facebookId || !resolvedState || !resolvedDistrict || !resolvedCapital) {
    return responseHandler({
      res,
      code: statusCode.DATAMISSING,
      message: "instaId, facebookId, state/district/capital (or location) are required",
    });
  }

  const existingPartnerReq = await PartnerDetails.findOne({
    userId: foundUser._id,
    verificationStatus: "pending",
  });
  if (existingPartnerReq) {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "You already have a pending partner enrollment request",
    });
  }

  let influencerDetail = await InfluencerDetails.findOne({ userId: foundUser._id });
  if (influencerDetail && influencerDetail.verificationStatus === "approved") {
    return responseHandler({
      res,
      code: statusCode.CONFLICT,
      message: "Your influencer profile is already approved",
    });
  }

  if (!influencerDetail) {
    influencerDetail = new InfluencerDetails({ userId: foundUser._id });
  }

  influencerDetail.instaId = instaId;
  influencerDetail.facebookId = facebookId;
  influencerDetail.state = resolvedState;
  influencerDetail.district = resolvedDistrict;
  influencerDetail.capital = resolvedCapital;
  influencerDetail.isVerified = false;
  influencerDetail.verificationStatus = "pending";

  await influencerDetail.save();

  return responseHandler({
    res,
    code: statusCode.SUCCESS,
    message: "Influencer enrollment request submitted. Admin will review within 24 hours.",
    data: {
      influencerId: influencerDetail._id,
      verificationStatus: influencerDetail.verificationStatus,
    },
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
  // Generate 4 digit OTP and setting expiration (5 minutes)
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

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