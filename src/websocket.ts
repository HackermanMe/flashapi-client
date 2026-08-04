import type { EventCallback, FlashEvent, Unsubscribe } from './types.js';

interface WebSocketManagerConfig {
  baseUrl: string;
  WebSocketConstructor?: new (url: string) => WebSocket;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
  debug?: boolean;
  logger?: (message: string, context?: Record<string, unknown>) => void;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private readonly wsUrl: string;
  private readonly WebSocketImpl: new (url: string) => WebSocket;
  private readonly reconnectBaseDelay: number;
  private readonly reconnectMaxDelay: number;
  private readonly debug: boolean;
  private readonly logger: (message: string, context?: Record<string, unknown>) => void;

  private readonly subscriptions = new Map<string, Set<EventCallback>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(config: WebSocketManagerConfig) {
    const httpUrl = config.baseUrl.replace(/\/+$/, '');
    this.wsUrl = httpUrl.replace(/^http/, 'ws') + '/ws';
    this.WebSocketImpl = config.WebSocketConstructor ?? globalThis.WebSocket;
    this.reconnectBaseDelay = config.reconnectBaseDelay ?? 1000;
    this.reconnectMaxDelay = config.reconnectMaxDelay ?? 30000;
    this.debug = config.debug ?? false;
    this.logger = config.logger ?? console.debug;
  }

  subscribe<T = unknown>(topic: string, callback: EventCallback<T>): Unsubscribe {
    if (this.disposed) throw new Error('WebSocketManager has been disposed');

    const callbacks = this.subscriptions.get(topic) ?? new Set();
    callbacks.add(callback as EventCallback);
    this.subscriptions.set(topic, callbacks);

    if (this.state === 'disconnected') {
      this.connect();
    } else if (this.state === 'connected') {
      this.sendSubscribe(topic);
    }

    return () => {
      callbacks.delete(callback as EventCallback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(topic);
        if (this.state === 'connected') {
          this.sendUnsubscribe(topic);
        }
      }
      if (this.subscriptions.size === 0) {
        this.disconnect();
      }
    };
  }

  dispose(): void {
    this.disposed = true;
    this.subscriptions.clear();
    this.disconnect();
  }

  getState(): ConnectionState {
    return this.state;
  }

  private connect(): void {
    if (this.state !== 'disconnected') return;

    if (!this.WebSocketImpl) {
      throw new Error(
        'WebSocket is not available. Pass webSocketConstructor in client config (e.g. from the "ws" package).'
      );
    }

    this.state = 'connecting';
    this.log('Connecting...');

    try {
      this.ws = new this.WebSocketImpl(this.wsUrl);
    } catch (e) {
      this.state = 'disconnected';
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempt = 0;
      this.log('Connected');

      for (const topic of this.subscriptions.keys()) {
        this.sendSubscribe(topic);
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as FlashEvent;
        this.dispatch(data);
      } catch {
        this.log('Failed to parse message', { raw: event.data });
      }
    };

    this.ws.onclose = () => {
      this.state = 'disconnected';
      this.ws = null;
      this.log('Disconnected');

      if (!this.disposed && this.subscriptions.size > 0) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.log('WebSocket error');
    };
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
    this.reconnectAttempt = 0;
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;

    const exponential = this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempt);
    const jitter = exponential * (0.5 + Math.random() * 0.5);
    const delay = Math.min(jitter, this.reconnectMaxDelay);

    this.log(`Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  private dispatch(event: FlashEvent): void {
    const globalTopic = '/topic/entities';
    const entityTopic = `/topic/${event.entity?.toLowerCase()}`;

    const globalCallbacks = this.subscriptions.get(globalTopic);
    if (globalCallbacks) {
      for (const cb of globalCallbacks) cb(event);
    }

    const entityCallbacks = this.subscriptions.get(entityTopic);
    if (entityCallbacks) {
      for (const cb of entityCallbacks) cb(event);
    }
  }

  private sendSubscribe(topic: string): void {
    this.send({ action: 'subscribe', topic });
  }

  private sendUnsubscribe(topic: string): void {
    this.send({ action: 'unsubscribe', topic });
  }

  private send(data: unknown): void {
    if (this.ws && this.state === 'connected') {
      this.ws.send(JSON.stringify(data));
    }
  }

  private log(message: string, context?: Record<string, unknown>): void {
    if (this.debug) {
      this.logger(`[flashapi:ws] ${message}`, context);
    }
  }
}
