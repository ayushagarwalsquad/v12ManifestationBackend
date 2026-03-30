const bcrypt = require('bcrypt');


exports.bcryptedPasswordFunc = async (password) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  return hashedPassword;
};
//use like this
// const hashedPassword = await bcryptedPasswordFunc(password);

exports.verifyPassword = async (password, hashedPassword) => {
    try {
        const isVerified = await bcrypt.compare(password, hashedPassword)
        return isVerified
    } catch (e) {
        console.log('Error in password verification');
        throw new Error('Password verification failed');
    }
}
//use like this
// const isMatch = await verifyPassword(password, admin.password);