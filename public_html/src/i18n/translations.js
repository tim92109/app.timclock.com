const namespaceModules = import.meta.glob('./namespaces/*.js', { eager: true });

const mergeNamespace = (language) =>
  Object.keys(namespaceModules)
    .sort()
    .reduce((merged, path) => {
      const table = namespaceModules[path]?.default?.[language];
      if (table && typeof table === 'object') {
        Object.assign(merged, table);
      }
      return merged;
    }, {});

const discoverLanguages = () => {
  const languages = new Set();
  Object.values(namespaceModules).forEach((module) => {
    const tables = module?.default;
    if (tables && typeof tables === 'object') {
      Object.keys(tables).forEach((language) => languages.add(language));
    }
  });
  return Array.from(languages);
};

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

export const translations = {
  en: mergeNamespace('en'),
  es: mergeNamespace('es'),
};

discoverLanguages()
  .sort()
  .forEach((language) => {
    if (!Object.prototype.hasOwnProperty.call(translations, language)) {
      translations[language] = mergeNamespace(language);
    }
  });

export default translations;
