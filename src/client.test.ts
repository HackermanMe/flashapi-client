import { describe, it, expect } from 'vitest';
import { FlashClient } from './client.js';
import { EntityResource } from './resource.js';

describe('FlashClient', () => {
  it('creates an entity resource', () => {
    const client = new FlashClient({ baseUrl: 'http://localhost:8080/api' });
    const products = client.entity('products');
    expect(products).toBeInstanceOf(EntityResource);
  });

  it('creates typed entity resources', () => {
    interface Product {
      id: number;
      name: string;
      price: number;
    }

    const client = new FlashClient({ baseUrl: 'http://localhost:8080/api' });
    const products = client.entity<Product>('products');
    expect(products).toBeInstanceOf(EntityResource);
  });

  it('disposes cleanly without active subscriptions', () => {
    const client = new FlashClient({ baseUrl: 'http://localhost:8080/api' });
    expect(() => client.dispose()).not.toThrow();
  });
});
