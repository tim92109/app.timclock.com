import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import { STORAGE_KEYS } from '../utils/constants';
import { translations } from '../i18n/translations';

export const DEFAULT_SETTINGS = {
  theme: 'system',
  language: 'en',
  dateFormat: 'MMM d, yyyy',
  weekStart: 'sunday',
  timezone: 'auto',
  defaultHourlyRate: 0,
  roundTo: 'none',
  emailNotifications: true,
  weeklySummary: false,
};

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

const readStoredSettings = () => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    // Malformed or unavailable storage: fall back to defaults.
    return { ...DEFAULT_SETTINGS };
  }
};

const persistSettings = (settings) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.USER_PREFERENCES,
      JSON.stringify(settings)
    );
  } catch {
    // Storage may be unavailable (private mode); preferences stay in memory.
  }
};

const prefersDark = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const resolveTheme = (theme) => {
  if (theme === 'system') {
    return prefersDark() ? 'dark' : 'light';
  }
  return theme;
};

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(readStoredSettings);
  const [systemTheme, setSystemTheme] = useState(() =>
    prefersDark() ? 'dark' : 'light'
  );

  // Apply the resolved theme before paint so there is no flash of the wrong theme.
  useLayoutEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme, systemTheme]);

  // Track OS-level color scheme preference while the theme is set to "system".
  useEffect(() => {
    if (
      settings.theme !== 'system' ||
      typeof window === 'undefined' ||
      !window.matchMedia
    ) {
      return undefined;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    setSystemTheme(media.matches ? 'dark' : 'light');

    if (media.addEventListener) {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [settings.theme]);

  const updateSettings = useCallback((partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      persistSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    persistSettings(next);
    setSettings(next);
  }, []);

  const language = settings.language;

  const t = useCallback(
    (key, fallback) => {
      const table = translations[language] || {};
      return table[key] ?? translations.en[key] ?? fallback ?? key;
    },
    [language]
  );

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      resetSettings,
      t,
      language,
      theme: settings.theme,
    }),
    [settings, updateSettings, resetSettings, t, language]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsProvider;
