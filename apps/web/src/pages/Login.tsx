import { Link } from 'react-router-dom';
import { authApi } from '../api/auth.js';
import { AuthForm } from './AuthForm.js';

export function Login() {
  return (
    <AuthForm
      title="Log in"
      submitLabel="Log in"
      strict={false}
      submit={(email, password) => authApi.login({ email, password })}
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="text-white underline">
            Create an account
          </Link>
        </>
      }
    />
  );
}
