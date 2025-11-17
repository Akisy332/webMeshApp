// Базовые типы данных
export interface Session {
  id: number;
  name: string;
  description?: string;
  datetime: string;
  date?: string;
}

export interface ModuleData {
  id_module: string;
  id_session: number;
  module_name: string;
  module_color: string;
  coords?: {
    lat: number;
    lon: number;
    alt: number;
  };
  datetime_unix: number;
  gps_ok: boolean;
}

export interface User {
  user_id?: number;
  username: string;
  role: 'public' | 'user' | 'curator' | 'admin' | 'developer';
  authenticated: boolean;
}

export interface TimeRange {
  min: number;
  max: number;
}