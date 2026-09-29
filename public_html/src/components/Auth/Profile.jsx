import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { User, Lock, Save, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useSettings } from '../../hooks/useSettings.jsx';
import { isValidEmail } from '../../utils/helpers';
import { ROLE_CONFIG } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';

const Profile = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const {
    user, 
    updateProfile, 
    changePassword, 
    isUpdateProfileLoading, 
    isChangePasswordLoading 
  } = useAuth();
  const { t } = useSettings();

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
    reset: resetProfile,
  } = useForm({
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      hourly_rate: user?.hourly_rate || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPassword,
    watch,
  } = useForm();

  const newPassword = watch('newPassword');

  const onProfileSubmit = async (data) => {
    try {
      await updateProfile(data);
      resetProfile(data);
    } catch (error) {
      // Error is handled by the auth hook
    }
  };

  const onPasswordSubmit = async (data) => {
    try {
      await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      resetPassword();
    } catch (error) {
      // Error is handled by the auth hook
    }
  };

  const roleConfig = ROLE_CONFIG[user?.role] || ROLE_CONFIG.employee;

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('auth.profile.title')}</h1>
        <p className="mt-2 text-gray-600">
          {t('auth.profile.subtitle')}
        </p>
      </div>

      <div className="bg-white shadow rounded-lg">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'profile'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <User className="w-5 h-5 inline mr-2" />
              {t('auth.profile.tabProfile')}
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'password'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Lock className="w-5 h-5 inline mr-2" />
              {t('auth.profile.tabPassword')}
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'profile' && (
            <div>
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900">{t('auth.profile.infoHeading')}</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {t('auth.profile.infoDescription')}
                </p>
              </div>

              {/* User Info Card */}
              <div className="mb-6 p-4 bg-gray-50 flex rounded-lg">
                <div className="flex items-center">
                  <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold text-white">
                      {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
                    </span>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium text-gray-900">
                      {user?.first_name} {user?.last_name}
                    </h4>
                    <p className="text-sm text-gray-600">@{user?.username}</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleConfig.bgColor} ${roleConfig.textColor}`}>
                      {roleConfig.label}
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                      {t('auth.profile.firstNameLabel')}
                    </label>
                    <input
                      {...registerProfile('first_name', {
                        required: t('auth.profile.firstNameRequired'),
                        minLength: {
                          value: 2,
                          message: t('auth.profile.firstNameMin'),
                        },
                      })}
                      type="text"
                      className={`input mt-1 ${profileErrors.first_name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                    />
                    {profileErrors.first_name && (
                      <p className="mt-1 text-sm text-red-600">{profileErrors.first_name.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                      {t('auth.profile.lastNameLabel')}
                    </label>
                    <input
                      {...registerProfile('last_name', {
                        required: t('auth.profile.lastNameRequired'),
                        minLength: {
                          value: 2,
                          message: t('auth.profile.lastNameMin'),
                        },
                      })}
                      type="text"
                      className={`input mt-1 ${profileErrors.last_name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                    />
                    {profileErrors.last_name && (
                      <p className="mt-1 text-sm text-red-600">{profileErrors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    {t('auth.profile.emailLabel')}
                  </label>
                  <input
                    {...registerProfile('email', {
                      required: t('auth.profile.emailRequired'),
                      validate: (value) => isValidEmail(value) || t('auth.profile.emailInvalid'),
                    })}
                    type="email"
                    className={`input mt-1 ${profileErrors.email ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  />
                  {profileErrors.email && (
                    <p className="mt-1 text-sm text-red-600">{profileErrors.email.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                    {t('auth.profile.phoneLabel')}
                  </label>
                  <input
                    {...registerProfile('phone')}
                    type="tel"
                    className={`input mt-1 ${profileErrors.phone ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                    placeholder={t('auth.profile.phonePlaceholder')}
                  />
                  {profileErrors.phone && (
                    <p className="mt-1 text-sm text-red-600">{profileErrors.phone.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="hourly_rate" className="block text-sm font-medium text-gray-700">
                    {t('auth.profile.hourlyRateLabel')}
                  </label>
                  <input
                    {...registerProfile('hourly_rate', {
                      min: {
                        value: 0,
                        message: t('auth.profile.hourlyRateMin'),
                      },
                    })}
                    type="number"
                    step="0.01"
                    className={`input mt-1 ${profileErrors.hourly_rate ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  />
                  {profileErrors.hourly_rate && (
                    <p className="mt-1 text-sm text-red-600">{profileErrors.hourly_rate.message}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdateProfileLoading}
                    className="btn-primary btn-md flex items-center"
                  >
                    {isUpdateProfileLoading ? (
                      <LoadingSpinner size="sm" color="white" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {t('auth.profile.save')}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'password' && (
            <div>
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900">{t('auth.profile.changePasswordHeading')}</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {t('auth.profile.changePasswordDescription')}
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-6">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                    {t('auth.profile.currentPasswordLabel')}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      {...registerPassword('currentPassword', {
                        required: t('auth.profile.currentPasswordRequired'),
                      })}
                      type={showCurrentPassword ? 'text' : 'password'}
                      className={`input pr-10 ${passwordErrors.currentPassword ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {passwordErrors.currentPassword && (
                    <p className="mt-1 text-sm text-red-600">{passwordErrors.currentPassword.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                    {t('auth.profile.newPasswordLabel')}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      {...registerPassword('newPassword', {
                        required: t('auth.profile.newPasswordRequired'),
                        minLength: {
                          value: 6,
                          message: t('auth.profile.newPasswordMin'),
                        },
                      })}
                      type={showNewPassword ? 'text' : 'password'}
                      className={`input pr-10 ${passwordErrors.newPassword ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {passwordErrors.newPassword && (
                    <p className="mt-1 text-sm text-red-600">{passwordErrors.newPassword.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">
                    {t('auth.profile.confirmNewPasswordLabel')}
                  </label>
                  <input
                    {...registerPassword('confirmNewPassword', {
                      required: t('auth.profile.confirmNewPasswordRequired'),
                      validate: (value) => value === newPassword || t('auth.profile.passwordMismatch'),
                    })}
                    type="password"
                    className={`input mt-1 ${passwordErrors.confirmNewPassword ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                  />
                  {passwordErrors.confirmNewPassword && (
                    <p className="mt-1 text-sm text-red-600">{passwordErrors.confirmNewPassword.message}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isChangePasswordLoading}
                    className="btn-primary btn-md flex items-center"
                  >
                    {isChangePasswordLoading ? (
                      <LoadingSpinner size="sm" color="white" />
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        {t('auth.profile.changePassword')}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;