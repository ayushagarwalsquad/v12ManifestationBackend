const mongoose = require('mongoose');
const Admin = require('../models/adminModel');

const main = async () => {
    try {
        const mongodburl = process.env.MONGO_URI_NON_SRV || process.env.MONGO_URI;
        await mongoose.connect(mongodburl);
        console.log(`Connected to MongoDB`);
        await Admin.ensureDefaultSuperAdmin();
        console.log("Default super admin ensured");
    } catch (error) {
        console.log('Error connecting to MongoDB:', error);
    }
};

main();