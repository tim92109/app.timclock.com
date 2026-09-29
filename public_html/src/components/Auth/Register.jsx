import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Clock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useSettings } from '../../hooks/useSettings.jsx';
import { isValidEmail, sanitizeForm } from '../../utils/helpers';
import { USER_ROLES } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import LanguageSwitcher from '../Common/LanguageSwitcher';

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register: registerUser, isRegisterLoading } = useAuth();
  const { t } = useSettings();
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      role: USER_ROLES.EMPLOYEE,
    },
  });

  const password = watch('password');

  const onSubmit = async (data) => {
    try {
      const userData = { ...data };
      delete userData.confirmPassword;

      // The API treats an empty string as an invalid number; only send
      // optional numeric fields when the user actually provided a value.
      await registerUser(sanitizeForm(userData, ['hourly_rate']));
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
            {t('auth.register.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('auth.register.or')}{' '}
            <Link
              to="/login"
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              {t('auth.register.signIn')}
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                  {t('auth.register.firstNameLabel')}
                </label>
                <input
                  {...register('first_name', {
                    required: t('auth.register.firstNameRequired'),
                    minLength: {
                      value: 2,
                      message: t('auth.register.firstNameMin'),
                    },
                  })}
                  type="text"
                  autoComplete="given-name"
                  className={`input mt-1 ${errors.first_name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  placeholder={t('auth.register.firstNamePlaceholder')}
                />
                {errors.first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                  {t('auth.register.lastNameLabel')}
                </label>
                <input
                  {...register('last_name', {
                    required: t('auth.register.lastNameRequired'),
                    minLength: {
                      value: 2,
                      message: t('auth.register.lastNameMin'),
                    },
                  })}
                  type="text"
                  autoComplete="family-name"
                  className={`input mt-1 ${errors.last_name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  placeholder={t('auth.register.lastNamePlaceholder')}
                />
                {errors.last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                {t('auth.register.usernameLabel')}
              </label>
              <input
                {...register('username', {
                  required: t('auth.register.usernameRequired'),
                  minLength: {
                    value: 3,
                    message: t('auth.register.usernameMin'),
                  },
                  pattern: {
                    value: /^[a-zA-Z0-9_]+$/,
                    message: t('auth.register.usernamePattern'),
                  },
                })}
                type="text"
                autoComplete="username"
                className={`input mt-1 ${errors.username ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                placeholder={t('auth.register.usernamePlaceholder')}
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                {t('auth.register.emailLabel')}
              </label>
              <input
                {...register('email', {
                  required: t('auth.register.emailRequired'),
                  validate: (value) => isValidEmail(value) || t('auth.register.emailInvalid'),
                })}
                type="email"
                autoComplete="email"
                className={`input mt-1 ${errors.email ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                placeholder={t('auth.register.emailPlaceholder')}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                {t('auth.register.roleLabel')}
              </label>
              <select
                {...register('role', { required: t('auth.register.roleRequired') })}
                id="role"
                className={`input mt-1 ${errors.role ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
              >
                <option value={USER_ROLES.EMPLOYEE}>{t('auth.register.roleEmployee')}</option>
                <option value={USER_ROLES.CONTRACTOR}>{t('auth.register.roleContractor')}</option>
                <option value={USER_ROLES.MANAGER}>{t('auth.register.roleManager')}</option>
              </select>
              {errors.role && (
                <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="hourly_rate" className="block text-sm font-medium text-gray-700">
                {t('auth.register.hourlyRateLabel')}
              </label>
              <input
                {...register('hourly_rate', {
                  min: {
                    value: 0,
                    message: t('auth.register.hourlyRateMin'),
                  },
                })}
                type="number"
                step="0.01"
                className={`input mt-1 ${errors.hourly_rate ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                placeholder="0.00"
              />
              {errors.hourly_rate && (
                <p className="mt-1 text-sm text-red-600">{errors.hourly_rate.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t('auth.register.passwordLabel')}
              </label>
              <div className="mt-1 relative">
                <input
                  {...register('password', {
                    required: t('auth.register.passwordRequired'),
                    minLength: {
                      value: 8,
                      message: t('auth.register.passwordMin'),
                    },
                  })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input pr-10 ${errors.password ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  placeholder={t('auth.register.passwordPlaceholder')}
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                {t('auth.register.confirmLabel')}
              </label>
              <div className="mt-1 relative">
                <input
                  {...register('confirmPassword', {
                    required: t('auth.register.confirmRequired'),
                    validate: (value) => value === password || t('auth.register.passwordMismatch'),
                  })}
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input pr-10 ${errors.confirmPassword ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  placeholder={t('auth.register.confirmPlaceholder')}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isRegisterLoading}
              className="btn-primary btn-lg w-full flex justify-center"
            >
              {isRegisterLoading ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('auth.register.submit')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;