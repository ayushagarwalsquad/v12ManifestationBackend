const express = require('express');
const router = express.Router();

const userCtrl = require("../controllers/userController");
const { userAuth } = require("../middleware/userAuth");

router.post('/sendOtp', userCtrl.sendOtp);
router.post('/createAccount', userCtrl.createAccount);
router.post('/login', userCtrl.login);
router.post('/login/partner', userCtrl.partnerLogin);
router.post('/register/influencer', userCtrl.registerInfluencer);
router.post('/register/partner', userCtrl.registerPartner);
router.post('/enroll/partner', userAuth, userCtrl.requestPartnerEnrollment);
router.post('/enroll/influencer', userAuth, userCtrl.requestInfluencerEnrollment);
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