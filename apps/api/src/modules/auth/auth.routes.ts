// Express routes for auth endpoints

import { authenticate } from "../../middleware/authenticate";

// me route, making sure user is still logged in when page refreshes
authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
    // Get the user by their ID
    const user = await AuthService.getUserById(req.user!.id);
    res.json(user);
}));