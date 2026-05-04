const Manager = require("../models/managerModel");
const PartnerDetails = require("../models/partnerDetailsModel");
const Admin = require("../models/adminModel");
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");
const { catchAsyncError } = require("../utils/generateError");
const { generateManagerToken } = require("../utils/tokenUtils");
const { bcryptedPasswordFunc } = require("../utils/bcryption");

const normalizeEmail = (value) => (value || "").toString().trim().toLowerCase();
const normalizeTrim = (value) => (value === undefined || value === null ? "" : value.toString().trim());
const normalizeDocImages = (docImages) =>
    (Array.isArray(docImages) ? docImages : [])
        .map((item) => (item ? item.toString().trim() : ""))
        .filter(Boolean);

const normalizeCodePart = (value) =>
    (value || "")
        .toString()
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

const escapeRegex = (value) => value.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getNextPartnerManagerCode = async ({ district, capital }) => {
    const normalizedDistrict = normalizeCodePart(district);
    const normalizedCapital = normalizeCodePart(capital);
    const base = `PMR${normalizedDistrict}${normalizedCapital}`;

    const candidates = await Manager.find({
        partnerCode: { $regex: new RegExp(`^${escapeRegex(base)}\\d+$`) }
    }).select("partnerCode").lean();

    let max = 0;
    for (const row of candidates) {
        const match = (row.partnerCode || "").match(new RegExp(`^${escapeRegex(base)}(\\d+)$`));
        if (match) max = Math.max(max, parseInt(match[1], 10));
    }

    return `${base}${max + 1}`;
};

const getNextManagerId = async (managerType) => {
    const prefix = managerType === "partner_manager" ? "PM" : "AM";
    const lastManager = await Manager.aggregate([
        { $match: { managerId: { $regex: new RegExp(`^${prefix}-\\d+$`) } } },
        {
            $addFields: {
                numericManagerId: { $toInt: { $substr: ["$managerId", 3, -1] } }
            }
        },
        { $sort: { numericManagerId: -1 } },
        { $limit: 1 }
    ]);

    const nextNumber = lastManager.length > 0 ? lastManager[0].numericManagerId + 1 : 1;
    return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
};

const sanitizeManager = (manager) => {
    const managerData = manager.toObject ? manager.toObject() : { ...manager };
    delete managerData.password;
    delete managerData.resetPasswordOTP;
    delete managerData.resetPasswordExpires;
    return managerData;
};

exports.managerLogin = catchAsyncError(async (req, res) => {
    const { usernameOrEmail, password, deviceType, deviceToken } = req.body;

    if (!usernameOrEmail || !password || !deviceType || !deviceToken) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "usernameOrEmail, password, deviceType and deviceToken are required"
        });
    }

    const manager = await Manager.findOne({
        $or: [
            { username: normalizeTrim(usernameOrEmail).toLowerCase() },
            { email: normalizeEmail(usernameOrEmail) }
        ],
        status: "active"
    }).select("+password");

    if (!manager) {
        return responseHandler({
            res,
            code: statusCode.UNAUTHORIZED,
            message: "Invalid credentials"
        });
    }

    const isPasswordValid = await manager.comparePassword(password);
    if (!isPasswordValid) {
        return responseHandler({
            res,
            code: statusCode.UNAUTHORIZED,
            message: "Invalid credentials"
        });
    }

    const token = generateManagerToken(manager);

    // Update device info
    const existingDevice = manager.devices.find((device) => device.deviceToken === deviceToken);
    if (existingDevice) {
        existingDevice.deviceType = deviceType;
        existingDevice.accessToken = token;
    } else {
        manager.devices.push({
            deviceType,
            deviceToken,
            accessToken: token
        });
    }
    await manager.save();

    const managerData = sanitizeManager(manager);

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Manager login successful",
        data: {
            token,
            manager: managerData
        }
    });
});
exports.managerLogout = catchAsyncError(async (req, res) => {
    const managerId = req.managerId;
    const accessToken = req.accessToken;

    const manager = await Manager.findById(managerId);
    if (!manager) {
        return responseHandler({
            res,
            code: statusCode.RESULTNOTFOUND,
            message: "Manager not found"
        });
    }

    manager.devices = manager.devices.filter(
        (device) => device.accessToken !== accessToken
    );
    await manager.save();

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Manager logged out successfully"
    });
});

// ========== GET MANAGER PROFILE ==========
exports.getManagerProfile = catchAsyncError(async (req, res) => {
    const manager = await Manager.findById(req.managerId)
        .select("-password -resetPasswordOTP -resetPasswordExpires");

    if (!manager) {
        return responseHandler({
            res,
            code: statusCode.RESULTNOTFOUND,
            message: "Manager not found"
        });
    }

    // Get associates count using manager reference
    const partnerType = manager.managerType === "partner_manager" ? "manager_associate" : "agency_associate";
    const managerField = manager.managerType === "partner_manager" ? "managerId" : "agencyId";

    const associatesCount = await PartnerDetails.countDocuments({
        [managerField]: manager._id,
        partnerType: partnerType,
        verificationStatus: "approved"
    });

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Manager profile retrieved successfully",
        data: {
            ...manager.toObject(),
            associatesCount: associatesCount
        }
    });
});

// ========== UPDATE MANAGER PROFILE ==========
exports.updateManagerProfile = catchAsyncError(async (req, res) => {
    const allowedFields = [
        "username",
        "fullname",
        "profileImage",
        "dob",
        "gender",
        "countryCode",
        "mobileNumber",
        "bankAccountNumber",
        "bankIFSC",
        "bankHolderName",
        "bankName",
        "upiId"
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

    // Check username uniqueness if being updated
    if (updateFields.username) {
        const normalizedUsername = normalizeTrim(updateFields.username).toLowerCase();
        const existingManager = await Manager.findOne({
            username: normalizedUsername,
            _id: { $ne: req.managerId },
            status: { $ne: "deleted" }
        });

        if (existingManager) {
            return responseHandler({
                res,
                code: statusCode.CONFLICT,
                message: "Username already exists"
            });
        }
        updateFields.username = normalizedUsername;
    }

    // Normalize other fields if needed
    if (updateFields.countryCode) updateFields.countryCode = normalizeTrim(updateFields.countryCode);
    if (updateFields.mobileNumber) updateFields.mobileNumber = normalizeTrim(updateFields.mobileNumber);

    const manager = await Manager.findByIdAndUpdate(
        req.managerId,
        updateFields,
        { new: true, runValidators: true }
    ).select("-password -resetPasswordOTP -resetPasswordExpires");

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Manager profile updated successfully",
        data: manager
    });
});

// ========== UPDATE MANAGER STATUS (Admin Only) ==========
exports.updateManagerStatus = catchAsyncError(async (req, res) => {
    const { managerId } = req.query;
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

    const manager = await Manager.findOne({ _id: managerId, status: { $ne: "deleted" } });

    if (!manager) {
        return responseHandler({
            res,
            code: statusCode.RESULTNOTFOUND,
            message: "Manager not found"
        });
    }

    manager.status = status;
    if (status !== "active") {
        manager.devices = [];
    }
    await manager.save();

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Manager status updated successfully",
        data: sanitizeManager(manager)
    });
});

// ========== GET MANAGER'S ASSOCIATES ==========
exports.getManagerAssociates = catchAsyncError(async (req, res) => {
    const manager = await Manager.findById(req.managerId);

    if (!manager) {
        return responseHandler({
            res,
            code: statusCode.RESULTNOTFOUND,
            message: "Manager not found"
        });
    }

    const partnerType = manager.managerType === "partner_manager" ? "manager_associate" : "agency_associate";
    const managerField = manager.managerType === "partner_manager" ? "managerId" : "agencyId";

    // Get associates using manager reference
    const associates = await PartnerDetails.find({
        [managerField]: manager._id,
        partnerType: partnerType,
        verificationStatus: "approved"
    })
        .populate("userId", "username fullname email countryCode mobileNumber status")
        .sort({ createdAt: -1 });

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Manager associates retrieved successfully",
        data: {
            totalAssociates: associates.length,
            associates: associates
        }
    });
});

// ========== GET MANAGER DASHBOARD STATS ==========
exports.getManagerDashboard = catchAsyncError(async (req, res) => {
    const manager = await Manager.findById(req.managerId);

    if (!manager) {
        return responseHandler({
            res,
            code: statusCode.RESULTNOTFOUND,
            message: "Manager not found"
        });
    }

    // Get associates count using manager reference
    const partnerType = manager.managerType === "partner_manager" ? "manager_associate" : "agency_associate";
    const managerField = manager.managerType === "partner_manager" ? "managerId" : "agencyId";

    const associatesCount = await PartnerDetails.countDocuments({
        [managerField]: manager._id,
        partnerType: partnerType,
        verificationStatus: "approved"
    });

    const stats = {
        managerId: manager.managerId,
        fullname: manager.fullname,
        managerType: manager.managerType,
        territory: {
            state: manager.state,
            district: manager.district,
            capital: manager.capital
        },
        wallet: {
            balance: manager.walletBalance,
            commissionPercentage: manager.commissionPercentage,
            totalEarnings: manager.totalEarnings,
            totalSettlement: manager.totalSettlement
        },
        associates: {
            total: associatesCount
        },
        status: manager.status,
        verificationStatus: manager.verificationStatus,
        lastLoginAt: manager.lastLoginAt
    };

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Manager dashboard stats retrieved successfully",
        data: stats
    });
});
