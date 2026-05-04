const express = require("express");
const router = express.Router();
const agencyController = require("../controllers/agencyController");
const { agencyAuth } = require("../middleware/agencyAuth");

router.post("/register", agencyController.registerAgency);
router.post("/login", agencyController.loginAgency);
router.get("/profile", agencyAuth, agencyController.getAgencyProfile);
router.post("/logout", agencyAuth, agencyController.logoutAgency);

module.exports = router;
