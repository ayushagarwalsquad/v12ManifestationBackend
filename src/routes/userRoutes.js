const express = require('express');
const router = express.Router();

const userCtrl = require("../controllers/userController");
const { userAuth } = require("../middleware/userAuth");

router.post('/sendOtp', userCtrl.sendOtp);
router.post('/verifyOtpAndRegister', userCtrl.verifyOtpAndRegister);
router.post('/login', userCtrl.login);
router.post('/forgetPassword', userCtrl.forgetPassword);
router.post('/verifyPasswordResetOTP', userCtrl.verifyPasswordResetOTP);
router.get('/getprofile', userAuth, userCtrl.getprofile);
router.put('/editprofile', userAuth, userCtrl.editprofile);
router.put('/changePassword', userAuth, userCtrl.changepassword);
router.get('/getalladdresses', userAuth, userCtrl.getalladdresses);
router.post('/addorupdateaddress', userAuth, userCtrl.addorupdateaddress);
router.delete('/deleteaddress', userAuth, userCtrl.deleteaddress);
router.put('/updateaccountPrivacy', userAuth, userCtrl.updateaccountPrivacy);
router.post('/logout', userAuth, userCtrl.logout);


module.exports = router;