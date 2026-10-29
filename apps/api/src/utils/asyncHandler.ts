// Helper function, wraps async functions to catch errors and pass them to the next middleware

// IMPORTSSS
import type { RequestHandler } from 'express';

export const asyncHandler = (fn: RequestHandler): RequestHandler => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    }
}