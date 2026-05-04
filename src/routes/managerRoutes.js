const express = require("express");
const router = express.Router();
const managerController = require("../controllers/managerController");
const { managerAuth } = require("../middleware/managerAuth");

router.post("/login", managerController.managerLogin);
router.get("/profile", managerAuth, managerController.getManagerProfile);
router.put("/profile", managerAuth, managerController.updateManagerProfile);
router.post("/logout", managerAuth, managerController.managerLogout);
router.get("/associates", managerAuth, managerController.getManagerAssociates);
router.get("/dashboard", managerAuth, managerController.getManagerDashboard);
router.put("/updateStatus", managerAuth, managerController.updateManagerStatus);

module.exports = router;