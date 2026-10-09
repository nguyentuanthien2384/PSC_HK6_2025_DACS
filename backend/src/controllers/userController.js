import userService from '../services/userService';

const handle = (operation) => async (req, res) => {
    try {
        const data = await operation(req);
        const status = [401, 403, 503].includes(data.errCode) ? data.errCode : 200;
        return res.status(status).json(data);
    } catch (error) {
        const unavailable = error.statusCode === 503;
        console.error('User API error:', error.code || error.name || 'Error');
        return res.status(unavailable ? 503 : 500).json({
            errCode: unavailable ? 503 : -1,
            errMessage: unavailable ? error.message : 'Không thể xử lý yêu cầu. Vui lòng thử lại sau',
        });
    }
};

module.exports = {
    handleCreateNewUser: handle((req) => userService.handleCreateNewUser(req.body, req.user)),
    handleUpdateUser: handle((req) => userService.updateUserData(req.body, req.user)),
    handleDeleteUser: handle((req) => userService.deleteUser(req.body.id, req.user)),
    handleLogin: handle((req) => userService.handleLogin(req.body)),
    handleChangePassword: handle((req) => userService.handleChangePassword(req.body, req.user)),
    getAllUser: handle((req) => userService.getAllUser(req.query, req.user)),
    getDetailUserById: handle((req) => userService.getDetailUserById(req.query.id, req.user)),
    getDetailUserByEmail: handle((req) => userService.getDetailUserByEmail(req.query.email, req.user)),
    handleSendVerifyEmailUser: handle((req) => userService.handleSendVerifyEmailUser(req.body, req.user)),
    handleVerifyEmailUser: handle((req) => userService.handleVerifyEmailUser(req.body)),
    handleSendEmailForgotPassword: handle((req) => userService.handleSendEmailForgotPassword(req.body.email)),
    handleForgotPassword: handle((req) => userService.handleForgotPassword(req.body)),
    checkPhonenumberEmail: handle((req) => userService.checkPhonenumberEmail(req.query)),
};
