// Zod rules for request body validation 

// import statement
import { z } from 'zod';

// Schema definition for user registration
export const registerSchema = z.object({
    email: z.string().email(),
    // Password requires a min of 8 characters, at least 1 letter and 1 digit
    password: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/)
});

// Schema definition for login
export const loginSchema = z.object({
    email: z.string().email(),

    // password should not be empty, that's why use min(1)
    password: z.string().min(1)
});