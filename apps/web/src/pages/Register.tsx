import { Link } from 'react-router-dom';
import { authApi } from '../api/auth.js';
import { AuthForm } from './AuthForm.js';

export function Register() {
  return (
    <AuthForm
      title="Create account"
      submitLabel="Create account"
      strict
      submit={(email, password) => authApi.register({ email, password })}
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
