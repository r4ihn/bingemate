// Zod rules for request body validation 

// import statement
import { z } from 'zod';

// Emails are stored lower-case, so "Me@Test.com" and "me@test.com" are the same account
const email = z.string().trim().toLowerCase().email();

// Schema definition for user registration
export const registerSchema = z.object({
    email,
    // Password requires a min of 8 characters, at least 1 letter and 1 digit
    password: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/)
});

// Schema definition for login
export const loginSchema = z.object({
    email,

    // password should not be empty, that's why use min(1)
    password: z.string().min(1)
});

