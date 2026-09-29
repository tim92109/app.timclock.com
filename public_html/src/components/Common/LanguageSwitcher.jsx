import classNames from 'classnames';
import { useSettings } from '../../hooks/useSettings.jsx';
import { LANGUAGES } from '../../i18n/translations';

const US_STRIPE_HEIGHT = 40 / 13;
const US_RED_STRIPES = [0, 2, 4, 6, 8, 10, 12];
const US_STARS = [];
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 5; col += 1) {
    US_STARS.push([3 + col * 4.5, 3 + row * 5]);
  }
}

const UnitedStatesFlag = () => (
  <svg
    viewBox="0 0 60 40"
    className="h-full w-full block"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="60" height="40" fill="#ffffff" />
    {US_RED_STRIPES.map((index) => (
      <rect
        key={index}
        x="0"
        y={index * US_STRIPE_HEIGHT}
        width="60"
        height={US_STRIPE_HEIGHT}
        fill="#b22234"
      />
    ))}
    <rect x="0" y="0" width="24" height={7 * US_STRIPE_HEIGHT} fill="#3c3b6e" />
    {US_STARS.map(([cx, cy], index) => (
      <circle key={index} cx={cx} cy={cy} r="0.9" fill="#ffffff" />
    ))}
  </svg>
);

const NicaraguaFlag = () => (
  <svg
    viewBox="0 0 60 40"
    className="h-full w-full block"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="60" height="40" fill="#ffffff" />
    <rect width="60" height="13.33" fill="#0067c6" />
    <rect y="26.67" width="60" height="13.33" fill="#0067c6" />
    {/* Simplified coat of arms: triangle, rainbow and volcanoes */}
    <path
      d="M30 14 L40 28 L20 28 Z"
      fill="#ffffff"
      stroke="#0067c6"
      strokeWidth="1.2"
    />
    <path d="M23 22 A7 7 0 0 1 37 22" fill="none" stroke="#e0402a" strokeWidth="1.1" />
    <path
      d="M24.5 22 A5.5 5.5 0 0 1 35.5 22"
      fill="none"
      stroke="#f2c200"
      strokeWidth="1.1"
    />
    <path d="M22 28 L26 22.5 L30 28 Z" fill="#4b5563" />
    <path d="M28 28 L32 23 L36 28 Z" fill="#6b7280" />
    <rect x="24" y="26" width="12" height="2" fill="#3b82f6" />
  </svg>
);

const FLAGS = {
  en: UnitedStatesFlag,
  es: NicaraguaFlag,
};

const LanguageSwitcher = ({ variant = 'compact', className }) => {
  const { settings, updateSettings, t } = useSettings();
  const activeLanguage = settings.language;
  const isFull = variant === 'full';

  return (
    <div
      role="group"
      aria-label={t('settings.language')}
      className={classNames('inline-flex items-center gap-1', className)}
    >
      {LANGUAGES.map((language) => {
        const Flag = FLAGS[language.code];
        const selected = activeLanguage === language.code;

        return (
          <button
            key={language.code}
            type="button"
            onClick={() => updateSettings({ language: language.code })}
            aria-pressed={selected}
            aria-label={language.label}
            title={language.label}
            className={classNames(
              'inline-flex items-center justify-center rounded-md border transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary-500',
              isFull
                ? 'gap-2 px-3 py-2 text-sm font-medium'
                : 'h-8 w-10 p-1',
              selected
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            )}
          >
            <span className="block h-4 w-6 overflow-hidden rounded-[2px] ring-1 ring-black/10">
              {Flag ? <Flag /> : null}
            </span>
            {isFull && <span>{language.label}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
