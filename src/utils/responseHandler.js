module.exports = {
    responseHandler: ({ res, code, message, data, error, ...othervalues }) => {
        const isSuccess = code >= 200 && code < 300;
        return res.status(code).json({ 
            code, 
            success: isSuccess ? true : false, 
            message, 
            data, 
            error, 
            ...othervalues 
        });
    },    
};