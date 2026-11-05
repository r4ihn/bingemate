import { Link } from 'react-router-dom';
import { authApi } from '../api/auth.js';
import { AuthForm } from './AuthForm.js';

export function Register() {
  return (
    <AuthForm
      title="Create account"
      submitLabel="Create account"
      strict
      withUsername
      submit={({ email, password, username }) =>
        authApi.register({ email, password, username: username! })
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-white underline">
            Log in
          </Link>
        </>
      }
    />
  );
}
