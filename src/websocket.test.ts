import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketManager } from './websocket.js';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.({ type: 'close' } as CloseEvent);
  }
}

describe('WebSocketManager', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createManager() {
    return new WebSocketManager({
      baseUrl: 'http://localhost:8080/api',
      WebSocketConstructor: MockWebSocket as unknown as new (url: string) => WebSocket,
    });
  }

  it('connects lazily on first subscribe', () => {
    const manager = createManager();
    expect(MockWebSocket.instances).toHaveLength(0);

    manager.subscribe('/topic/products', () => {});
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:8080/api/ws');
  });

  it('sends subscribe message on open', () => {
    const manager = createManager();
    manager.subscribe('/topic/products', () => {});

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    expect(ws.sent).toContainEqual(JSON.stringify({ action: 'subscribe', topic: '/topic/products' }));
  });

  it('dispatches events to the correct callbacks', () => {
    const manager = createManager();
    const callback = vi.fn();
    manager.subscribe('/topic/products', callback);

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({
      type: 'ENTITY_CREATED',
      entity: 'products',
      data: { id: 1, name: 'Test' },
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(callback).toHaveBeenCalledWith({
      type: 'ENTITY_CREATED',
      entity: 'products',
      data: { id: 1, name: 'Test' },
      timestamp: '2024-01-01T00:00:00Z',
    });
  });

  it('dispatches to global /topic/entities subscribers', () => {
    const manager = createManager();
    const callback = vi.fn();
    manager.subscribe('/topic/entities', callback);

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({
      type: 'ENTITY_UPDATED',
      entity: 'products',
      data: { id: 1 },
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes and sends unsubscribe message', () => {
    const manager = createManager();
    const unsub = manager.subscribe('/topic/products', () => {});

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    unsub();

    expect(ws.sent).toContainEqual(JSON.stringify({ action: 'unsubscribe', topic: '/topic/products' }));
  });

  it('disconnects when all subscriptions are removed', () => {
    const manager = createManager();
    const unsub = manager.subscribe('/topic/products', () => {});

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    unsub();

    expect(ws.readyState).toBe(3);
    expect(manager.getState()).toBe('disconnected');
  });

  it('reconnects automatically on unexpected close', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const manager = createManager();
    manager.subscribe('/topic/products', () => {});

    const ws1 = MockWebSocket.instances[0]!;
    ws1.simulateOpen();
    ws1.simulateClose();

    expect(manager.getState()).toBe('disconnected');

    vi.advanceTimersByTime(2000);

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('resubscribes to all topics after reconnect', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const manager = createManager();
    manager.subscribe('/topic/products', () => {});
    manager.subscribe('/topic/entities', () => {});

    const ws1 = MockWebSocket.instances[0]!;
    ws1.simulateOpen();
    ws1.simulateClose();

    vi.advanceTimersByTime(2000);

    const ws2 = MockWebSocket.instances[1]!;
    ws2.simulateOpen();

    const subscribeMessages = ws2.sent.map(s => JSON.parse(s));
    expect(subscribeMessages).toContainEqual({ action: 'subscribe', topic: '/topic/products' });
    expect(subscribeMessages).toContainEqual({ action: 'subscribe', topic: '/topic/entities' });
  });

  it('does not reconnect after dispose', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const manager = createManager();
    manager.subscribe('/topic/products', () => {});

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    manager.dispose();

    vi.advanceTimersByTime(60000);

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('constructs correct WebSocket URL from https', () => {
    const manager = new WebSocketManager({
      baseUrl: 'https://api.example.com/v1',
      WebSocketConstructor: MockWebSocket as unknown as new (url: string) => WebSocket,
    });
    manager.subscribe('/topic/test', () => {});

    expect(MockWebSocket.instances[0]!.url).toBe('wss://api.example.com/v1/ws');
  });
});
