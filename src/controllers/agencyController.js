const Agency = require("../models/agencyModel");
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");
const { catchAsyncError } = require("../utils/generateError");
const { bcryptedPasswordFunc, verifyPassword } = require("../utils/bcryption");
const { generateAgencyToken } = require("../utils/tokenUtils");

const normalizeTrim = (value) => (value === undefined || value === null ? "" : value.toString().trim());
const normalizeEmail = (value) => normalizeTrim(value).toLowerCase();

const getNextAgencyId = async () => {
    const lastAgency = await Agency.aggregate([
        { $match: { agencyId: { $regex: /^AG-\d+$/ } } },
        {
            $addFields: {
                numericAgencyId: { $toInt: { $substr: ["$agencyId", 3, -1] } }
            }
        },
        { $sort: { numericAgencyId: -1 } },
        { $limit: 1 }
    ]);

    const nextNumber = lastAgency.length > 0 ? lastAgency[0].numericAgencyId + 1 : 1;
    return `AG-${String(nextNumber).padStart(4, "0")}`;
};

exports.registerAgency = catchAsyncError(async (req, res) => {
    const {
        username,
        fullname,
        email,
        countryCode,
        mobileNumber,
        password,
        profileImage,
        dob,
        gender
    } = req.body;

    if (!username || !email || !countryCode || !mobileNumber || !password) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "username, email, countryCode, mobileNumber and password are required"
        });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedCountryCode = normalizeTrim(countryCode);
    const normalizedMobileNumber = normalizeTrim(mobileNumber);
    const normalizedUsername = normalizeTrim(username).toLowerCase();

    const existingAgency = await Agency.findOne({
        $or: [
            { username: normalizedUsername },
            { email: normalizedEmail },
            { countryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber }
        ],
        status: { $ne: "deleted" }
    });

    if (existingAgency) {
        return responseHandler({
            res,
            code: statusCode.CONFLICT,
            message: "Agency already exists with same username/email/mobile"
        });
    }

    const agencyId = await getNextAgencyId();
    const hashedPassword = await bcryptedPasswordFunc(password);

    const createdAgency = await Agency.create({
        agencyId,
        username: normalizedUsername,
        fullname: normalizeTrim(fullname) || normalizeTrim(username),
        email: normalizedEmail,
        countryCode: normalizedCountryCode,
        mobileNumber: normalizedMobileNumber,
        password: hashedPassword,
        profileImage,
        dob,
        gender,
        status: "active"
    });

    return responseHandler({
        res,
        code: statusCode.CREATED,
        message: "Agency created successfully",
        data: {
            agencyId: createdAgency._id,
            publicAgencyId: createdAgency.agencyId
        }
    });
});
exports.loginAgency = catchAsyncError(async (req, res) => {
    const { usernameOrEmail, password, deviceType, deviceToken } = req.body;

    if (!usernameOrEmail || !password || !deviceType || !deviceToken) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "usernameOrEmail, password, deviceType and deviceToken are required"
        });
    }

    const normalizedLogin = normalizeTrim(usernameOrEmail).toLowerCase();
    const agency = await Agency.findOne({
        $or: [{ username: normalizedLogin }, { email: normalizeEmail(usernameOrEmail) }],
        status: "active"
    });

    if (!agency) {
        return responseHandler({
            res,
            code: statusCode.UNAUTHORIZED,
            message: "Invalid credentials"
        });
    }

    const isPasswordValid = await verifyPassword(password, agency.password);
    if (!isPasswordValid) {
        return responseHandler({
            res,
            code: statusCode.UNAUTHORIZED,
            message: "Invalid credentials"
        });
    }

    const token = generateAgencyToken(agency);
    const existingDevice = agency.devices.find((device) => device.deviceToken === deviceToken);

    if (existingDevice) {
        existingDevice.deviceType = deviceType;
        existingDevice.accessToken = token;
        existingDevice.updatedAt = new Date();
    } else {
        agency.devices.push({
            deviceType,
            deviceToken,
            accessToken: token
        });
    }

    await agency.save();

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Agency login successful",
        data: {
            token,
            agency: {
                _id: agency._id,
                agencyId: agency.agencyId,
                agencyCode: agency.agencyCode,
                fullname: agency.fullname,
                username: agency.username,
                email: agency.email,
                countryCode: agency.countryCode,
                mobileNumber: agency.mobileNumber,
                profileImage: agency.profileImage,
                status: agency.status
            }
        }
    });
});
exports.getAgencyProfile = catchAsyncError(async (req, res) => {
    const agency = await Agency.findById(req.agencyId).select("-password");
    if (!agency) {
        return responseHandler({
            res,
            code: statusCode.RESULTNOTFOUND,
            message: "Agency not found"
        });
    }

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Agency profile fetched successfully",
        data: agency
    });
});
exports.logoutAgency = catchAsyncError(async (req, res) => {
    const agency = await Agency.findById(req.agencyId);
    if (!agency) {
        return responseHandler({
            res,
            code: statusCode.RESULTNOTFOUND,
            message: "Agency not found"
        });
    }

    agency.devices = (agency.devices || []).filter((device) => device.accessToken !== req.accessToken);
    await agency.save();

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Agency logged out successfully"
    });
});