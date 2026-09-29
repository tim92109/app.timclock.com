import { useState } from 'react';
import { Palette, Globe, Clock, Bell, Save, RotateCcw } from 'lucide-react';
import classNames from 'classnames';
import toast from 'react-hot-toast';
import { useSettings, DEFAULT_SETTINGS } from '../../hooks/useSettings.jsx';
import LanguageSwitcher from '../Common/LanguageSwitcher';

const THEME_OPTIONS = [
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
  { value: 'system', labelKey: 'settings.themeSystem' },
];

const DATE_FORMAT_OPTIONS = [
  'MMM d, yyyy',
  'MM/dd/yyyy',
  'dd/MM/yyyy',
  'yyyy-MM-dd',
];

const WEEK_START_OPTIONS = [
  { value: 'sunday', labelKey: 'settings.weekStartSunday' },
  { value: 'monday', labelKey: 'settings.weekStartMonday' },
];

const TIMEZONE_OPTIONS = [
  { value: 'auto', label: 'Auto (browser)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
];

const ROUND_OPTIONS = [
  { value: 'none', labelKey: 'settings.roundNone' },
  { value: '5', labelKey: 'settings.round5' },
  { value: '15', labelKey: 'settings.round15' },
];

const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={classNames(
      'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
      checked ? 'bg-primary-600' : 'bg-gray-200'
    )}
  >
    <span
      className={classNames(
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0'
      )}
    />
  </button>
);

const Settings = () => {
  const { settings, updateSettings, resetSettings, t } = useSettings();
  const [draft, setDraft] = useState(settings);

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleSave = () => {
    // Language is applied immediately by LanguageSwitcher, so the local
    // draft can be stale for it. Persist the live value so saving other
    // preferences does not revert the language.
    updateSettings({ ...draft, language: settings.language });
    toast.success(t('settings.saved'));
  };

  const handleReset = () => {
    resetSettings();
    setDraft({ ...DEFAULT_SETTINGS });
    toast.success(t('settings.resetDone'));
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('settings.title')}</h1>
        <p className="mt-2 text-gray-600">{t('settings.subtitle')}</p>
      </div>

      <div className="space-y-6">
        {/* Appearance */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center">
              <Palette className="w-5 h-5 text-primary-600 mr-2" />
              <h2 className="card-title">{t('settings.appearance')}</h2>
            </div>
          </div>
          <div className="card-content space-y-6">
            <div>
              <span className="block text-sm font-medium text-gray-700">
                {t('settings.theme')}
              </span>
              <div
                role="radiogroup"
                aria-label={t('settings.theme')}
                className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3"
              >
                {THEME_OPTIONS.map((option) => {
                  const selected = draft.theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        update({ theme: option.value });
                        updateSettings({ theme: option.value });
                      }}
                      className={classNames(
                        'flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                        selected
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      {t(option.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700">
                {t('settings.language')}
              </span>
              <LanguageSwitcher variant="full" className="mt-2" />
            </div>
          </div>
        </div>

        {/* Regional */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center">
              <Globe className="w-5 h-5 text-primary-600 mr-2" />
              <h2 className="card-title">{t('settings.regional')}</h2>
            </div>
          </div>
          <div className="card-content grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-date-format"
                className="block text-sm font-medium text-gray-700"
              >
                {t('settings.dateFormat')}
              </label>
              <select
                id="settings-date-format"
                className="select mt-1"
                value={draft.dateFormat}
                onChange={(e) => update({ dateFormat: e.target.value })}
              >
                {DATE_FORMAT_OPTIONS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-week-start"
                className="block text-sm font-medium text-gray-700"
              >
                {t('settings.weekStart')}
              </label>
              <select
                id="settings-week-start"
                className="select mt-1"
                value={draft.weekStart}
                onChange={(e) => update({ weekStart: e.target.value })}
              >
                {WEEK_START_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="settings-timezone"
                className="block text-sm font-medium text-gray-700"
              >
                {t('settings.timezone')}
              </label>
              <select
                id="settings-timezone"
                className="select mt-1"
                value={draft.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Time Tracking */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center">
              <Clock className="w-5 h-5 text-primary-600 mr-2" />
              <h2 className="card-title">{t('settings.timeTracking')}</h2>
            </div>
          </div>
          <div className="card-content grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-hourly-rate"
                className="block text-sm font-medium text-gray-700"
              >
                {t('settings.defaultHourlyRate')}
              </label>
              <input
                id="settings-hourly-rate"
                type="number"
                min="0"
                step="0.01"
                className="input mt-1"
                value={draft.defaultHourlyRate}
                onChange={(e) =>
                  update({ defaultHourlyRate: Number(e.target.value) })
                }
              />
            </div>

            <div>
              <label
                htmlFor="settings-round-to"
                className="block text-sm font-medium text-gray-700"
              >
                {t('settings.roundTo')}
              </label>
              <select
                id="settings-round-to"
                className="select mt-1"
                value={draft.roundTo}
                onChange={(e) => update({ roundTo: e.target.value })}
              >
                {ROUND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center">
              <Bell className="w-5 h-5 text-primary-600 mr-2" />
              <h2 className="card-title">{t('settings.notifications')}</h2>
            </div>
          </div>
          <div className="card-content divide-y divide-gray-100">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm font-medium text-gray-700">
                {t('settings.emailNotifications')}
              </span>
              <Toggle
                checked={draft.emailNotifications}
                onChange={(value) => update({ emailNotifications: value })}
                label={t('settings.emailNotifications')}
              />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm font-medium text-gray-700">
                {t('settings.weeklySummary')}
              </span>
              <Toggle
                checked={draft.weeklySummary}
                onChange={(value) => update({ weeklySummary: value })}
                label={t('settings.weeklySummary')}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="btn-outline btn-md flex items-center justify-center"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('settings.reset')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary btn-md flex items-center justify-center"
          >
            <Save className="w-4 h-4 mr-2" />
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
