const express = require("express");
const adminCtrl = require("../controllers/admin/adminController");
const { adminAuth, requireSuperAdmin } = require("../middleware/adminAuth");

const router = express.Router();
//---------------------------------------------------------------------------------------------
router.post("/login", adminCtrl.login);
router.post("/logout", adminAuth, adminCtrl.logout);
router.post("/createSubAdmin", adminAuth, requireSuperAdmin, adminCtrl.createSubAdmin);
router.put("/updateAdmin", adminAuth, requireSuperAdmin, adminCtrl.updateAdmin);
router.get("/getAdminById", adminAuth, requireSuperAdmin, adminCtrl.getAdminById);
router.get("/getAllSubAdmins", adminAuth, requireSuperAdmin, adminCtrl.getAllSubAdmins);
router.patch("/updateAdminStatus", adminAuth, requireSuperAdmin, adminCtrl.updateAdminStatus);
//---------------------------------------------------------------------------------------------
router.get("/partnerRequests", adminAuth, requireSuperAdmin, adminCtrl.getPartnerRequests);
router.patch("/verifyPartner", adminAuth, requireSuperAdmin, adminCtrl.verifyPartner);
//---------------------------------------------------------------------------------------------
router.get("/influencerRequests", adminAuth, requireSuperAdmin, adminCtrl.getInfluencerRequests);
router.patch("/verifyInfluencer", adminAuth, requireSuperAdmin, adminCtrl.verifyInfluencer);
//---------------------------------------------------------------------------------------------
router.post("/managers/partner", adminAuth, requireSuperAdmin, adminCtrl.createPartnerManager);
router.post("/managers/agency", adminAuth, requireSuperAdmin, adminCtrl.createAgencyManager);
router.get("/managers/partner", adminAuth, requireSuperAdmin, adminCtrl.listPartnerManagers);
router.get("/managers/agency", adminAuth, requireSuperAdmin, adminCtrl.listAgencyManagers);
router.get("/listAllManagers", adminAuth, requireSuperAdmin, adminCtrl.listAllManagers);
router.get("/getManagerById", adminAuth, requireSuperAdmin, adminCtrl.getManagerById);

module.exports = router;