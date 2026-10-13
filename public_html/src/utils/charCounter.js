/**
 * Character counter for any text field that declares a `maxLength`.
 *
 * Call `initCharCounters()` once (see main.jsx). It then finds every
 * <input>/<textarea> carrying a `maxlength` attribute and renders a small
 * "+ chars: N" indicator under it with the number of characters left.
 *
 * Fields added later (modals, route changes, ...) are picked up
 * automatically through a MutationObserver, and React-controlled values are
 * tracked through a delegated `input` listener.
 */

const COUNTER_CLASS = 'char-counter';
const INIT_FLAG = 'charCounterInit';
const TEXT_INPUT_TYPES = ['text', 'email', 'tel', 'url', 'password', 'search'];

let started = false;

const isTextField = (el) => {
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return TEXT_INPUT_TYPES.includes(type);
};

const updateCounter = (field) => {
  const counter = field.nextElementSibling;
  if (!counter || !counter.classList.contains(COUNTER_CLASS)) return;

  const max = parseInt(field.getAttribute('maxlength'), 10);
  if (!max) return;

  const remaining = max - field.value.length;
  counter.textContent = `+ chars: ${remaining}`;
  counter.classList.toggle('char-counter-low', remaining <= Math.max(1, Math.floor(max * 0.1)));
};

const attachCounter = (field) => {
  if (!isTextField(field) || field.dataset[INIT_FLAG]) return;
  field.dataset[INIT_FLAG] = 'true';

  const counter = document.createElement('span');
  counter.className = COUNTER_CLASS;
  counter.setAttribute('aria-hidden', 'true');
  field.insertAdjacentElement('afterend', counter);

  updateCounter(field);
};

const scan = (root) => {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : document;

  if (scope.matches && scope.matches('input[maxlength], textarea[maxlength]')) {
    attachCounter(scope);
  }
  scope.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(attachCounter);
};

export const initCharCounters = () => {
  if (started || typeof document === 'undefined') return;
  started = true;

  scan(document);

  document.addEventListener(
    'input',
    (event) => {
      const field = event.target;
      if (field && field.hasAttribute && field.hasAttribute('maxlength')) {
        updateCounter(field);
      }
    },
    true
  );

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
};

export default initCharCounters;
