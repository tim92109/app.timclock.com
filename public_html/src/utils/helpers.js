import { format, parseISO, isValid, differenceInMinutes, differenceInHours } from 'date-fns';
import { DATE_FORMATS } from './constants';

// Date formatting utilities
export const formatDate = (date, formatString = DATE_FORMATS.DISPLAY) => {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return '';
    return format(dateObj, formatString);
  } catch (error) {
    console.error('Date formatting error:', error);
    return '';
  }
};

export const formatDateTime = (date) => {
  return formatDate(date, DATE_FORMATS.DISPLAY_WITH_TIME);
};

export const formatTime = (date) => {
  return formatDate(date, DATE_FORMATS.TIME_ONLY);
};

export const formatDateForInput = (date) => {
  return formatDate(date, DATE_FORMATS.INPUT);
};

// Time duration utilities
export const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '0h 0m';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

export const formatDurationDecimal = (minutes) => {
  if (!minutes || minutes < 0) return '0.00';
  return (minutes / 60).toFixed(2);
};

export const parseDurationToMinutes = (durationString) => {
  if (!durationString) return 0;
  
  // Parse formats like "2h 30m", "2.5h", "150m"
  const hourMatch = durationString.match(/(\d+(?:\.\d+)?)h/);
  const minuteMatch = durationString.match(/(\d+)m/);
  
  let totalMinutes = 0;
  
  if (hourMatch) {
    totalMinutes += parseFloat(hourMatch[1]) * 60;
  }
  
  if (minuteMatch) {
    totalMinutes += parseInt(minuteMatch[1]);
  }
  
  return totalMinutes;
};

export const calculateTimeDifference = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  
  try {
    const start = typeof startTime === 'string' ? parseISO(startTime) : startTime;
    const end = typeof endTime === 'string' ? parseISO(endTime) : endTime;
    
    return differenceInMinutes(end, start);
  } catch (error) {
    console.error('Time difference calculation error:', error);
    return 0;
  }
};

// Currency formatting
export const formatCurrency = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined) return '';
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

// Number formatting
export const formatNumber = (number, decimals = 0) => {
  if (number === null || number === undefined) return '';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number);
};

// String utilities
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

// Array utilities
export const groupBy = (array, key) => {
  return array.reduce((groups, item) => {
    const group = item[key];
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
};

export const sortBy = (array, key, direction = 'asc') => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
};

// Object utilities
export const removeEmptyValues = (obj) => {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {});
};

export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

// Validation utilities
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

export const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// File utilities
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileExtension = (filename) => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
};

// Color utilities
export const getStatusColor = (status, config) => {
  return config[status] || config.default || { color: 'gray', bgColor: 'bg-gray-100', textColor: 'text-gray-800' };
};

// Timer utilities
export const formatTimer = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const calculateElapsedTime = (startTime) => {
  if (!startTime) return 0;
  
  try {
    const start = typeof startTime === 'string' ? parseISO(startTime) : startTime;
    const now = new Date();
    return Math.floor(differenceInMinutes(now, start));
  } catch (error) {
    console.error('Elapsed time calculation error:', error);
    return 0;
  }
};

// Local storage utilities
export const getFromStorage = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return defaultValue;
  }
};

export const setToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error writing to localStorage:', error);
  }
};

export const removeFromStorage = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
};

// Debounce utility
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Throttle utility
export const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Generate random ID
export const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

// Calculate billable amount
export const calculateBillableAmount = (minutes, hourlyRate) => {
  if (!minutes || !hourlyRate) return 0;
  return (minutes / 60) * hourlyRate;
};

// Progress calculation
export const calculateProgress = (actual, estimated) => {
  if (!estimated || estimated === 0) return 0;
  return Math.min(Math.round((actual / estimated) * 100), 100);
};

// Export all utilities as default object
export default {
  formatDate,
  formatDateTime,
  formatTime,
  formatDateForInput,
  formatDuration,
  formatDurationDecimal,
  parseDurationToMinutes,
  calculateTimeDifference,
  formatCurrency,
  formatNumber,
  truncateText,
  capitalizeFirst,
  slugify,
  groupBy,
  sortBy,
  removeEmptyValues,
  deepClone,
  isValidEmail,
  isValidPhone,
  isValidUrl,
  formatFileSize,
  getFileExtension,
  getStatusColor,
  formatTimer,
  calculateElapsedTime,
  getFromStorage,
  setToStorage,
  removeFromStorage,
  debounce,
  throttle,
  generateId,
  calculateBillableAmount,
  calculateProgress,
};