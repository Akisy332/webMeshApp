export const EventTypes = {
  ERROR: 'error',
  SOCKET: {
    NEW_DATA_MODULE: 'moduleUpdate'
  },
  TABLE: {
    CHECKBOX_MARKER: 'changeVisibleMarker',
    CHECKBOX_TRACE: 'changeVisibleTrace',
    CLEAR: 'clearTable'
  },
  ROUTE_SLIDER: {
    TIME_SLIDER_CHANGED: 'time_slider_changed',
    TIME_RANGE_CHANGED: 'time_range_changed',
    TIME_SLIDER_TOGGLE: 'time_slider_toggle',
    TIME_SLIDER_SET: 'time_slider_set',
  },
  SESSION: {
    LIST_LOADED: 'session_list_loaded',
    LOAD_DATA: 'session_load_data',
    SELECTED: 'session_selected',
    UPDATED: 'session_updated',
  }
} as const;

// Временные пороги в секундах
export const TIME_THRESHOLDS = {
  FRESH: 60,      // < 1 минуты - свежие данные
  WARNING: 300,   // 1-5 минут - предупреждение
  STALE: 600      // > 5 минут - устаревшие данные
} as const;

export const API_ENDPOINTS = {
  SESSIONS: '/api/sessions',
  MODULES: '/api/modules',
  AUTH: '/api/auth',
  USERS: '/api/users'
} as const;