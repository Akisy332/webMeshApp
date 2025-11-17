// frontend/src/core/socket-service.ts
import { eventBus } from './event-bus.js';
import { EventTypes } from './constants.js';

export class SocketService {
  private socket: any;

  constructor() {
    this.init();
  }

  private init(): void {
    // @ts-ignore - io глобальная переменная из Socket.IO
    this.socket = io({
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.socket.on('connect', () => {
      console.log('✅ Connected to server (TypeScript)');
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('❌ Disconnected:', reason);
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('Connection error:', error.message);
    });

    // Перенаправление событий от сервера в EventBus
    this.socket.on(EventTypes.SOCKET.NEW_DATA_MODULE, (data: any) => {
      eventBus.emit(EventTypes.SOCKET.NEW_DATA_MODULE, data);
    });

    this.socket.on('session_updated', (data: any) => {
      switch (data.action) {
        case 'created':
        case 'updated':
        case 'deleted':
          eventBus.emit(EventTypes.SESSION.UPDATED);
          break;
      }
    });
  }

  public emit(event: string, data?: any): void {
    this.socket.emit(event, data);
  }

  public on(event: string, callback: (data: any) => void): void {
    this.socket.on(event, callback);
  }
}