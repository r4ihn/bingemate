// Logic connecting to Prisma database, handling authenticated requests & managing
// user sessions

// import statements and dependencies
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword } from '../../utils/password';

// GLOBUL INITZZ
const prisma = new PrismaClient();


// register logic 
class authService {
    // register method
    static async register(email: string, password: string) {
        // Check if user already exists using email via prisma
        const existingUser = await prisma.user.findUnique({
            where: { email: email }
        })

        // what to do if user already exist
        if (existingUser) {
            throw new Error('Email already in use');
        }

        // Hash password using the function from utils/password.ts
        const hashedPassword = await hashPassword(password);

        // create new user with hashed pass and emaik
        const newUser = await prisma.user.create({
            data: {
                email: email,
                // passwordHash comes from the database schema
                passwordHash: hashedPassword
            }
        });
        return {id: newUser.id, email: newUser.email, role: newUser.role};
    }


    // login method
    static async login(email: string, password: string) {
        // find user by email
        const user = await prisma.user.findUnique({
            where: { email: email }
        })

        // what to do if user no exist or password compare fails
        if (!user) {
            throw new Error ('Invalid email or password');
        }
        const passwordMatch = await comparePassword(password, user.passwordHash);
        if (!passwordMatch) {
            throw new Error ('Invalid email or password');
        }
        return {id: user.id, email: user.email, role: user.role};
    }

    // me method, this is for making sure user is still logged in and can acces their own data
    // when page is refreshed
    static async me(userId: string) {
        // find user by it's id
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) { // If user is not found?
            throw new Error('User not found');
        }
        // select only the stuff we want to return to client, no password tho!
        return {id: user.id, email: user.email, role: user.role};

    }
}