import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Clock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useSettings } from '../../hooks/useSettings.jsx';
import LoadingSpinner from '../Common/LoadingSpinner';
import LanguageSwitcher from '../Common/LanguageSwitcher';

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoginLoading } = useAuth();
  const { t } = useSettings();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    try {
      await login(data);
    } catch (error) {
      // Error is handled by the auth hook
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 flex py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="flex items-center">
              <Clock className="w-12 h-12 text-primary-600" />
              <span className="ml-2 text-3xl font-bold text-gray-900">TimClock</span>
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t('auth.login.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('auth.login.or')}{' '}
            <Link
              to="/register"
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              {t('auth.login.createAccount')}
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                {t('auth.login.usernameLabel')}
              </label>
              <input
                {...register('username', {
                  required: t('auth.login.usernameRequired'),
                })}
                type="text"
                autoComplete="username"
                className={`input mt-1 ${errors.username ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                placeholder={t('auth.login.usernamePlaceholder')}
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t('auth.login.passwordLabel')}
              </label>
              <div className="mt-1 relative">
                <input
                  {...register('password', {
                    required: t('auth.login.passwordRequired'),
                  })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`input pr-10 ${errors.password ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  placeholder={t('auth.login.passwordPlaceholder')}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                {t('auth.login.rememberMe')}
              </label>
            </div>

            <div className="text-sm">
              <a
                href="#"
                className="font-medium text-primary-600 hover:text-primary-500"
              >
                {t('auth.login.forgotPassword')}
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoginLoading}
              className="btn-primary btn-lg w-full flex justify-center"
            >
              {isLoginLoading ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('auth.login.submit')
              )}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 flex text-gray-500">{t('auth.login.demoCredentials')}</span>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-600">
            <div className="bg-gray-100 p-3 rounded-md">
              <p className="font-medium">{t('auth.login.demoAdmin')}</p>
              <p>{t('auth.login.demoAdminCreds')}</p>
            </div>
            <div className="bg-gray-100 p-3 rounded-md">
              <p className="font-medium">{t('auth.login.demoManager')}</p>
              <p>{t('auth.login.demoManagerCreds')}</p>
            </div>
            <div className="bg-gray-100 p-3 rounded-md">
              <p className="font-medium">{t('auth.login.demoEmployee')}</p>
              <p>{t('auth.login.demoEmployeeCreds')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;