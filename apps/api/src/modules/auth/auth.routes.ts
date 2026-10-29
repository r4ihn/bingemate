// Express routes for auth endpoints

// IMPORRRRRRRRTTTTSSSSSSSS
import { authenticate } from "../../middleware/authenticate.js";
import { authLimiter } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { authService } from "./auth.service.js";
import { signToken } from "../../utils/jwt.js";
import { setAuthCookie ,clearAuthCookie } from "../../utils/authCookie.js";
import { Router } from "express";

// INIT the router for auth endpoints
export const authRouter: Router = Router();

// METHODS!!!!!!!!
// get user by ID route, making sure user is still logged in when page refreshes
authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
    // Get the user by their ID
    const user = await authService.getUserById(req.user!.id);
    res.json(user);
}));

authRouter.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
    const user = await authService.register(req.body.email, req.body.password);
    setAuthCookie(res, signToken(user));
    res.status(201).json(user);
}));

authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
    const user = await authService.login(req.body.email, req.body.password);
    setAuthCookie(res, signToken(user));
    res.status(200).json(user);
}));

// No authenticate here: an expired or broken cookie must still be clearable
authRouter.post('/logout', (_req, res) => {
    clearAuthCookie(res);
    // 204 = No Content, so no body
    res.status(204).end();
});
