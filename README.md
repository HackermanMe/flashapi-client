# @flashapi/client

Type-safe SDK client for any [FlashAPI](https://github.com/HackermanMe/flashapi) backend (Python or Java).

## Features

- **Full CRUD** with pagination, sorting, search, and filtering (11 operators)
- **Bulk operations** (create, update, delete)
- **Soft delete** with restore
- **Export** (CSV, XLSX, PDF)
- **Audit history**
- **Real-time WebSocket** with auto-reconnect and exponential backoff
- **Rate limit handling** with automatic retry and jitter
- **Cancellation** via AbortSignal
- **Type-safe** generics throughout
- **Isomorphic** — works in Browser and Node.js 18+
- **Zero dependencies**
- **3.3 KB gzipped**

## Installation

```bash
npm install @flashapi/client
```

## Quick Start

```typescript
import { FlashClient } from '@flashapi/client';

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

const client = new FlashClient({
  baseUrl: 'http://localhost:8080/api',
  auth: { type: 'bearer', token: 'your-token' },
});

const products = client.entity<Product>('products');

// List with pagination and filters
const result = await products.list({
  page: 0,
  size: 20,
  sort: 'price,desc',
  filters: {
    price: { gte: 100, lte: 500 },
    category: { eq: 'electronics' },
  },
});
console.log(result.data);      // Product[]
console.log(result.meta);      // { page, size, totalElements, totalPages }

// CRUD
const created = await products.create({ name: 'Keyboard', price: 79, category: 'electronics' });
const fetched = await products.get(created.data.id);
const updated = await products.update(created.data.id, { price: 69 });
await products.delete(created.data.id);

// Soft delete & restore
await products.restore(created.data.id);
const deleted = await products.list({ deleted: true });

// Bulk
const bulk = await products.bulkCreate([
  { name: 'Mouse', price: 29, category: 'electronics' },
  { name: 'Pad', price: 15, category: 'accessories' },
]);
console.log(bulk.meta); // { total: 2, succeeded: 2, failed: 0 }

// Export
const blob = await products.export({ format: 'csv', sort: 'name,asc' });

// Audit history
const history = await products.history(1);

// Real-time WebSocket
const unsub = client.subscribe<Product>('/topic/products', (event) => {
  console.log(event.type, event.data); // 'ENTITY_CREATED', Product
});
// Cleanup
unsub();
client.dispose();
```

## Configuration

```typescript
const client = new FlashClient({
  // Required
  baseUrl: 'http://localhost:8080/api',

  // Auth (optional)
  auth: { type: 'bearer', token: 'xxx' },
  // or: auth: { type: 'header', name: 'X-API-Key', value: 'xxx' },
  // or: auth: { type: 'custom', interceptor: (headers) => headers },

  // Timeouts & retries (optional)
  timeout: 30000,    // Default: 30s
  retries: 3,        // Default: 3 (retries on 429, 502, 503, 504)

  // Debug (optional)
  debug: false,
  logger: console.debug,

  // WebSocket (optional, for Node.js < 21)
  webSocketConstructor: WebSocket,
});
```

## Request Cancellation

Every method accepts an optional `AbortSignal`:

```typescript
const controller = new AbortController();
const result = await products.list({ page: 0 }, controller.signal);

// Cancel from elsewhere
controller.abort();
```

## Filter Operators

| Operator | Description |
|----------|-------------|
| `eq` | Equal |
| `neq` | Not equal |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `contains` | Contains substring |
| `startswith` | Starts with |
| `endswith` | Ends with |
| `isnull` | Is null (true/false) |
| `in` | In list of values |

## Error Handling

```typescript
import { HttpError, RateLimitError, TimeoutError, NetworkError } from '@flashapi/client';

try {
  await products.get(999);
} catch (error) {
  if (error instanceof HttpError) {
    console.log(error.status);    // 404
    console.log(error.message);   // "Not found"
  }
  if (error instanceof RateLimitError) {
    console.log(error.rateLimit); // { limit, remaining, reset }
    console.log(error.retryAfter);
  }
  if (error instanceof TimeoutError) {
    console.log(error.timeout);   // 30000
  }
  if (error instanceof NetworkError) {
    console.log(error.originalCause);
  }
}
```

## Documentation

**[Full guide with real-world examples →](./docs/guide.md)**

The guide covers:
- Connecting to a backend with or without authentication
- Real-world scenarios: JWT, API Key, dynamic token refresh
- Integration with React, Vue, and Node.js
- Every feature in detail (filters, bulk, export, WebSocket, audit...)
- CORS troubleshooting
- FAQ

## Compatibility

Works with any backend implementing the [FlashAPI HTTP Spec v1](https://github.com/HackermanMe/spring-flashapi/blob/main/docs/ecosystem-spec.md):

- [flashapi](https://github.com/HackermanMe/flashapi) (Python)
- [spring-flashapi](https://github.com/HackermanMe/spring-flashapi) (Java/Spring)

## License

Apache-2.0
