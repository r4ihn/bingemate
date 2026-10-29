// Logic connecting to Prisma database, handling authenticated requests & managing
// user sessions

// import statements and dependencies
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import { HttpError } from '../../middleware/errorHandler.js';

// Checked against when the email is unknown, so a failed login always costs one bcrypt compare
// and response times don't reveal which emails are registered
const dummyHash = hashPassword('not-a-real-password-1');


// register logic 
export class authService {

    // METHODS HEREEEE

    // register method
    static async register(email: string, password: string) {
        // Hash password using the function from utils/password.ts
        const hashedPassword = await hashPassword(password);

        // create new user with hashed pass and email. No "does it exist?" check first: two
        // requests at once could both pass it. The unique email column stops the second one
        // instead, and Prisma reports that as error code P2002
        try {
            const newUser = await prisma.user.create({
                data: {
                    email: email,
                    // passwordHash comes from the database schema
                    passwordHash: hashedPassword
                }
            });
            return {id: newUser.id, email: newUser.email, role: newUser.role};
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                throw new HttpError(409,'Email already in use');
            }
            throw err;
        }
    }


    // login method
    static async login(email: string, password: string) {
        // find user by email
        const user = await prisma.user.findUnique({
            where: { email: email }
        })

        // always run the compare (against the dummy hash if there is no user), then fail both
        // cases the same way
        const passwordMatch = await comparePassword(password, user?.passwordHash ?? await dummyHash);
        if (!user || !passwordMatch) {
            throw new HttpError(401,'Invalid email or password');
        }
        return {id: user.id, email: user.email, role: user.role};
    }

    // getUserById method, this is for making sure user is still logged in and can acces their own data
    // when page is refreshed
    static async getUserById(userId: string) {
        // find user by it's id
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) { // If user is not found?
            throw new HttpError(401,'User not found');
        }
        // select only the stuff we want to return to client, no password tho!
        return {id: user.id, email: user.email, role: user.role};

    }
}