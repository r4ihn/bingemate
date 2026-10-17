export interface CredentialErrors {
  email?: string;
  password?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Registration rules. Confirm the password rule with RA (TASKS.md section 3). */
export function validateCredentials(email: string, password: string): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address';
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Use at least 8 characters with a letter and a number';
  }
  return errors;
}
