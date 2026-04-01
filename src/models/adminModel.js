const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;
const ADMIN_ROLES = ["super_admin", "sub_admin"];
const MODULE_NAMES = [
    "admin_management",
    "role_permission_management",
    "audit_logs",
    "user_management",
    "post_control",
    "banner_management",
    "wish_winner_management",
    "grant_giveaway_management",
    "partner_verification",
    "referral_coupon_management",
    "report_management",
    "help_management",
    "wallet_management",
    "cashback_management",
    "redemption_management",
    "settlement_management"
];
const buildFullAccessPermissions = () =>
    MODULE_NAMES.map((moduleName) => ({
        module: moduleName,
        canRead: true,
        canWrite: true,
        canEdit: true,
        canApprove: true,
        canDelete: true,
        fullAccess: true
    }));
const PermissionSchema = new Schema({
    module: {
        type: String,
        enum: MODULE_NAMES,
        required: true
    },
    canRead: {
        type: Boolean,
        default: false
    },
    canWrite: {
        type: Boolean,
        default: false
    },
    canEdit: {
        type: Boolean,
        default: false
    },
    canApprove: {
        type: Boolean,
        default: false
    },
    canDelete: {
        type: Boolean,
        default: false
    },
    fullAccess: {
        type: Boolean,
        default: false
    }
}, { _id: false });
const DeviceSchema = new Schema({
    deviceType: {
        type: String,
        enum: ["web"]
    },
    deviceToken: {
        type: String
    },
    accessToken: {
        type: String,
        required: true
    }
});
const AdminSchema = new Schema({
    adminId: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    role: {
        type: String,
        enum: ADMIN_ROLES,
        default: "sub_admin"
    },
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    countryCode: {
        type: String,
        trim: true
    },
    mobileNumber: {
        type: String,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    profileImage: {
        type: String,
        default: ""
    },
    permissions: {
        type: [PermissionSchema],
        default: []
    },
    devices: {
        type: [DeviceSchema],
        default: []
    },
    reportsTo: {
        type: Schema.Types.ObjectId,
        ref: "admin",
        default: null
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "admin",
        default: null
    },
    managedAdmins: [
        {
            type: Schema.Types.ObjectId,
            ref: "admin"
        }
    ],
    status: {
        type: String,
        enum: ["active", "inactive", "suspended", "deleted"],
        default: "active"
    },
    isDefaultSuperAdmin: {
        type: Boolean,
        default: false
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    passwordChangedAt: {
        type: Date,
        default: null
    },
    resetPasswordOTP: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    }
}, { timestamps: true });

AdminSchema.index(
    { countryCode: 1, mobileNumber: 1 },
    {
        unique: true,
        partialFilterExpression: {
            mobileNumber: { $exists: true, $type: "string", $ne: "" }
        }
    }
);

AdminSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 10);
    this.passwordChangedAt = new Date();
});

AdminSchema.methods.comparePassword = async function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
};

AdminSchema.methods.hasModuleAccess = function (moduleName, action = "canRead") {
    if (this.role === "super_admin") {
        return true;
    }

    const permission = this.permissions.find((item) => item.module === moduleName);
    if (!permission) {
        return false;
    }

    return permission.fullAccess || Boolean(permission[action]);
};

AdminSchema.statics.ensureDefaultSuperAdmin = async function () {
    const existingSuperAdmin = await this.findOne({
        role: "super_admin",
        status: { $ne: "deleted" }
    });

    if (existingSuperAdmin) {
        return existingSuperAdmin;
    }

    const defaultSuperAdmin = await this.create({
        adminId: "SA-1",
        role: "super_admin",
        fullName: process.env.SUPER_ADMIN_NAME || "Super Admin",
        username: (process.env.SUPER_ADMIN_USERNAME || "superadmin").toLowerCase(),
        email: (process.env.SUPER_ADMIN_EMAIL || "superadmin@example.com").toLowerCase(),
        countryCode: process.env.SUPER_ADMIN_COUNTRY_CODE || "+91",
        mobileNumber: process.env.SUPER_ADMIN_MOBILE || "9999999999",
        password: process.env.SUPER_ADMIN_PASSWORD || "Admin@12345",
        permissions: buildFullAccessPermissions(),
        devices: [],
        isDefaultSuperAdmin: true,
        status: "active"
    });

    return defaultSuperAdmin;
};

module.exports = mongoose.model("admin", AdminSchema);
