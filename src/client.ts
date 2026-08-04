import type { EventCallback, FlashClientConfig, Unsubscribe } from './types.js';
import { HttpClient } from './http.js';
import { EntityResource } from './resource.js';
import { WebSocketManager } from './websocket.js';

export class FlashClient {
  private readonly http: HttpClient;
  private wsManager: WebSocketManager | null = null;
  private readonly config: FlashClientConfig;

  constructor(config: FlashClientConfig) {
    this.config = config;
    this.http = new HttpClient(config);
  }

  entity<T>(name: string): EntityResource<T> {
    return new EntityResource<T>(this.http, name);
  }

  subscribe<T = unknown>(topic: string, callback: EventCallback<T>): Unsubscribe {
    if (!this.wsManager) {
      this.wsManager = new WebSocketManager({
        baseUrl: this.config.baseUrl,
        WebSocketConstructor: this.config.webSocketConstructor,
        debug: this.config.debug,
        logger: this.config.logger,
      });
    }
    return this.wsManager.subscribe<T>(topic, callback);
  }

  dispose(): void {
    this.wsManager?.dispose();
    this.wsManager = null;
  }
}
