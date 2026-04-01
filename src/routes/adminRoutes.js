const express = require("express");
const adminCtrl = require("../controllers/admin/adminController");
const { adminAuth, requireSuperAdmin } = require("../middleware/adminAuth");

const router = express.Router();

router.post("/login", adminCtrl.login);
router.post("/logout", adminAuth, adminCtrl.logout);
router.post("/createSubAdmin", adminAuth, requireSuperAdmin, adminCtrl.createSubAdmin);
router.put("/updateAdmin", adminAuth, requireSuperAdmin, adminCtrl.updateAdmin);
router.get("/getAdminById", adminAuth, requireSuperAdmin, adminCtrl.getAdminById);
router.get("/getAllSubAdmins", adminAuth, requireSuperAdmin, adminCtrl.getAllSubAdmins);
router.patch("/updateAdminStatus", adminAuth, requireSuperAdmin, adminCtrl.updateAdminStatus);

module.exports = router;