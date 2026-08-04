# @flashapi/client — Complete Guide

A step-by-step guide to using the SDK in a real project. Covers authentication, every feature, error handling, and framework integration with concrete, copy-pasteable examples.

---

## Table of Contents

- [What is this SDK?](#what-is-this-sdk)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [5-Minute Quickstart (end-to-end)](#5-minute-quickstart-end-to-end)
- [Entity naming — what string do I pass?](#entity-naming--what-string-do-i-pass)
- [Authentication](#authentication)
  - [No auth (public API)](#no-auth-public-api)
  - [Bearer token (JWT)](#bearer-token-jwt)
  - [API Key](#api-key)
  - [Dynamic token (auto-refresh)](#dynamic-token-auto-refresh)
  - [Changing credentials after creation](#changing-credentials-after-creation)
- [CRUD](#crud)
- [Pagination and sorting](#pagination-and-sorting)
- [Full-text search](#full-text-search)
- [Advanced filters](#advanced-filters)
- [Relations (expand)](#relations-expand)
- [Soft delete and restore](#soft-delete-and-restore)
- [Bulk operations](#bulk-operations)
- [File export](#file-export)
- [Audit history](#audit-history)
- [Real-time WebSocket](#real-time-websocket)
- [Error handling](#error-handling)
- [Request cancellation](#request-cancellation)
- [Rate limiting](#rate-limiting)
- [Debug mode](#debug-mode)
- [CORS — the #1 frontend issue](#cors--the-1-frontend-issue)
- [Using with React](#using-with-react)
- [Using with Vue](#using-with-vue)
- [Using with Node.js (server-side)](#using-with-nodejs-server-side)
- [ESM vs CommonJS imports](#esm-vs-commonjs-imports)
- [UI Components](#ui-components)
  - [Importing styles](#importing-styles)
  - [FlashTable (React)](#flashtable-react)
  - [FlashForm (React)](#flashform-react)
  - [Custom delete confirmation](#custom-delete-confirmation)
  - [Bulk operations in the table](#bulk-operations-in-the-table)
  - [Export from the table](#export-from-the-table)
  - [Vue composables](#vue-composables)
- [FAQ](#faq)

---

## What is this SDK?

`@flashapi/client` is a TypeScript HTTP client for any backend built with [FlashAPI](https://github.com/HackermanMe/flashapi) (Python) or [spring-flashapi](https://github.com/HackermanMe/spring-flashapi) (Java).

It handles:
- Type-safe requests and responses
- Automatic retry on 429/502/503/504 with exponential backoff + jitter
- Rate limit header parsing and respect for `Retry-After`
- Request timeout and cancellation via `AbortSignal`
- WebSocket real-time events with auto-reconnect
- Auth header injection (Bearer, API Key, or custom)

It does **NOT** handle:
- Login, register, OAuth flows — that's your app's responsibility
- Caching / deduplication — use React Query, SWR, or TanStack Query for that
- State management — it's a transport layer, not a store

---

## Prerequisites

Before using this SDK, you need:

1. **A running FlashAPI backend** — either:
   - Python: `pip install flashapi` ([docs](https://github.com/HackermanMe/flashapi))
   - Java: `io.github.hackermanme:spring-flashapi` ([docs](https://github.com/HackermanMe/spring-flashapi))

2. **Node.js 18+** (for native `fetch` support)

3. **If your frontend and backend run on different origins** (e.g. `localhost:3000` → `localhost:8000`), you must configure CORS on the backend. See [CORS section](#cors--the-1-frontend-issue).

---

## Installation

```bash
npm install @flashapi/client
```

Zero dependencies. Works in browsers and Node.js 18+.

---

## 5-Minute Quickstart (end-to-end)

Here's a minimal working example. Backend + frontend in under 2 minutes.

**1. Start a FlashAPI backend (Python):**

```bash
pip install flashapi uvicorn
```

```python
# main.py
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.orm import DeclarativeBase
from flashapi.fastapi import FlashAPI

engine = create_engine("sqlite:///./demo.db")

class Base(DeclarativeBase):
    pass

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    price = Column(Float, nullable=False)

Base.metadata.create_all(bind=engine)

app = FlashAPI(models=[Product], engine=engine).app
```

```bash
uvicorn main:app --reload
# API running at http://localhost:8000/api/products
```

**2. Use the SDK:**

```typescript
import { FlashClient } from '@flashapi/client';

interface Product {
  id: number;
  name: string;
  price: number;
}

const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
});

const products = client.entity<Product>('products');

// Create
const { data: created } = await products.create({ name: 'Keyboard', price: 79.99 });
console.log(created.id); // 1

// List
const { data, meta } = await products.list();
console.log(data);  // [{ id: 1, name: 'Keyboard', price: 79.99 }]
console.log(meta);  // { page: 0, size: 20, totalElements: 1, totalPages: 1 }
```

That's it. No config, no middleware, no boilerplate.

---

## Entity naming — what string do I pass?

```typescript
const products = client.entity<Product>('products');
//                                       ^^^^^^^^
//                                       This string = URL path segment
```

The string you pass to `.entity()` becomes the URL path: `{baseUrl}/{entity}`.

| You write | Requests go to |
|-----------|---------------|
| `client.entity('products')` | `http://localhost:8000/api/products` |
| `client.entity('order-items')` | `http://localhost:8000/api/order-items` |
| `client.entity('users')` | `http://localhost:8000/api/users` |

**How to know the right name:**
- **Python (FlashAPI)**: it's the `__tablename__` of your SQLAlchemy model, or the model class name lowercased + pluralized (depends on your config).
- **Java (spring-flashapi)**: it's the entity name lowercased + pluralized by default.
- **Easiest way**: check your backend's API. If `GET http://localhost:8000/api/products` returns data, use `'products'`.

---

## Authentication

### No auth (public API)

If the backend exposes public models (no `access` restriction):

```typescript
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
});
// No auth config needed — requests go without auth headers
```

### Bearer token (JWT)

The most common case. Your backend verifies a JWT in the `Authorization` header.

```typescript
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  auth: { type: 'bearer', token: 'eyJhbGciOiJIUzI1NiIs...' },
});
// Every request sends: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Where does the token come from?** You obtain it yourself — the SDK does NOT do login. Typical flow:

```typescript
// Step 1: Login (YOUR code, not the SDK)
const res = await fetch('http://localhost:8000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'pass123' }),
});
const { access_token } = await res.json();

// Step 2: Create the FlashAPI client with that token
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  auth: { type: 'bearer', token: access_token },
});

// Step 3: Use the SDK — auth is automatic
const orders = client.entity<Order>('orders');
const myOrders = await orders.list(); // Only returns YOUR orders (if backend uses scope="owner")
```

### API Key

For service-to-service or apps with static keys:

```typescript
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  auth: { type: 'header', name: 'X-API-Key', value: 'key-abc123' },
});
// Every request sends: X-API-Key: key-abc123
```

### Dynamic token (auto-refresh)

If your token expires and you need to refresh it before each request:

```typescript
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  auth: {
    type: 'custom',
    interceptor: async (headers) => {
      let token = localStorage.getItem('access_token');
      const expiry = Number(localStorage.getItem('token_expiry') || '0');

      // Refresh if token expires within 60 seconds
      if (Date.now() > expiry - 60_000) {
        const res = await fetch('http://localhost:8000/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        const data = await res.json();
        token = data.access_token;
        localStorage.setItem('access_token', token!);
        localStorage.setItem('token_expiry', String(Date.now() + data.expires_in * 1000));
      }

      headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  },
});
```

### Changing credentials after creation

The `type: 'bearer'` and `type: 'header'` configs are static — the token is captured at creation time. If the token can change during the app's lifetime, use `type: 'custom'`:

```typescript
// This WON'T auto-update:
const client = new FlashClient({
  auth: { type: 'bearer', token: getToken() }, // captured once
});

// This WILL always use the latest token:
const client = new FlashClient({
  auth: {
    type: 'custom',
    interceptor: (headers) => {
      headers.set('Authorization', `Bearer ${getToken()}`); // called on every request
      return headers;
    },
  },
});
```

---

## CRUD

```typescript
interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  available: boolean;
}

const products = client.entity<Product>('products');

// CREATE — returns { data: Product }
const { data: created } = await products.create({
  name: 'Mechanical keyboard',
  price: 89.99,
  category: 'electronics',
  available: true,
});
console.log(created.id); // 42

// READ one — returns { data: Product }
const { data: product } = await products.get(42);
console.log(product.name); // "Mechanical keyboard"

// UPDATE — returns { data: Product } with updated fields
const { data: updated } = await products.update(42, { price: 79.99 });
console.log(updated.price); // 79.99

// DELETE — returns nothing (HTTP 204)
await products.delete(42);
```

---

## Pagination and sorting

```typescript
// First page, 20 items (backend defaults)
const page1 = await products.list();

// Page 3 (0-indexed!), 50 items per page, sorted by price descending
const page3 = await products.list({
  page: 2,    // 0-indexed: page 0 = first page, page 2 = third page
  size: 50,
  sort: 'price,desc',
});

console.log(page3.meta);
// { page: 2, size: 50, totalElements: 342, totalPages: 7 }

// How to iterate all pages:
let page = 0;
let totalPages = 1;
while (page < totalPages) {
  const result = await products.list({ page, size: 100 });
  totalPages = result.meta.totalPages;
  processItems(result.data);
  page++;
}
```

**Pagination is 0-indexed**: `page: 0` is the first page, `page: 1` is the second, etc.

---

## Full-text search

```typescript
// Searches across all String fields in the model
const results = await products.list({ search: 'keyboard' });
// Finds products where name, category, description, etc. contain "keyboard"
```

---

## Advanced filters

11 operators are available:

```typescript
// Products between $50 and $200 in the "electronics" category
const filtered = await products.list({
  filters: {
    price: { gte: 50, lte: 200 },
    category: { eq: 'electronics' },
  },
});

// Name contains "pro" (case depends on backend DB)
const pro = await products.list({
  filters: { name: { contains: 'pro' } },
});

// Products in a set of categories
const selected = await products.list({
  filters: { category: { in: ['electronics', 'gaming', 'office'] } },
});

// Products with no description (null)
const noDesc = await products.list({
  filters: { description: { isnull: true } },
});

// Combine with search and sort
const complex = await products.list({
  search: 'wireless',
  filters: { price: { lte: 100 } },
  sort: 'price,asc',
  page: 0,
  size: 10,
});
```

**All operators:**

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equals | `{ status: { eq: 'active' } }` |
| `neq` | Not equals | `{ status: { neq: 'deleted' } }` |
| `gt` | Greater than | `{ price: { gt: 100 } }` |
| `gte` | Greater than or equal | `{ price: { gte: 100 } }` |
| `lt` | Less than | `{ stock: { lt: 5 } }` |
| `lte` | Less than or equal | `{ stock: { lte: 0 } }` |
| `contains` | Contains substring | `{ name: { contains: 'phone' } }` |
| `startswith` | Starts with | `{ name: { startswith: 'iPhone' } }` |
| `endswith` | Ends with | `{ email: { endswith: '@gmail.com' } }` |
| `isnull` | Is null / is not null | `{ deletedAt: { isnull: true } }` |
| `in` | In list | `{ category: { in: ['a', 'b'] } }` |

---

## Relations (expand)

If the backend has relationships configured (e.g., Product → Category):

```typescript
// Load product with its category included in the response
const { data } = await products.get(42, { expand: 'category' });

// Multiple relations
const { data } = await products.get(42, { expand: ['category', 'reviews'] });

// Works on list too
const result = await products.list({ expand: 'category', page: 0 });
```

---

## Soft delete and restore

If the backend has `soft_delete=True` on the model:

```typescript
// Delete (soft) — marked as deleted, not destroyed
await products.delete(42);

// List deleted items
const trash = await products.list({ deleted: true });
console.log(trash.data); // Products in the "trash"

// Restore
await products.restore(42); // Back to normal list
```

---

## Bulk operations

```typescript
// Create multiple items at once
const result = await products.bulkCreate([
  { name: 'Mouse', price: 29.99, category: 'electronics', available: true },
  { name: 'Mousepad', price: 14.99, category: 'accessories', available: true },
  { name: 'Webcam', price: 59.99, category: 'electronics', available: false },
]);
console.log(result.meta); // { total: 3, succeeded: 3, failed: 0 }
console.log(result.data); // The 3 created products with their IDs

// Update multiple
const updated = await products.bulkUpdate([
  { id: 1, price: 24.99 },
  { id: 2, price: 12.99 },
  { id: 3, available: true },
]);

// Delete multiple
const deleted = await products.bulkDelete([1, 2, 3]);
console.log(deleted.meta); // { total: 3, succeeded: 3, failed: 0 }
```

---

## File export

```typescript
// Export as CSV
const csvBlob = await products.export({ format: 'csv' });

// Export as XLSX with filters (only products > $100)
const xlsxBlob = await products.export({
  format: 'xlsx',
  filters: { price: { gte: 100 } },
  sort: 'name,asc',
});

// Download in the browser
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

downloadBlob(xlsxBlob, 'products.xlsx');
```

Available formats: `'csv'`, `'xlsx'`, `'pdf'`.

---

## Audit history

If the backend has `audit=True` on the model:

```typescript
const history = await products.history(42);

console.log(history.data);
// [
//   {
//     action: 'CREATE',
//     entityType: 'Product',
//     entityId: '42',
//     timestamp: '2026-08-03T10:00:00Z',
//     performedBy: 'admin',
//     changes: null   ← null on creation (no "before" state)
//   },
//   {
//     action: 'UPDATE',
//     entityType: 'Product',
//     entityId: '42',
//     timestamp: '2026-08-03T11:30:00Z',
//     performedBy: 'admin',
//     changes: {
//       price: { from: 89.99, to: 79.99 }   ← shows old and new value
//     }
//   }
// ]
```

---

## Real-time WebSocket

```typescript
// Listen to ALL entity events across the entire API
const unsub = client.subscribe('/topic/entities', (event) => {
  console.log(event.type);       // 'ENTITY_CREATED' | 'ENTITY_UPDATED' | 'ENTITY_DELETED' | 'ENTITY_RESTORED'
  console.log(event.entity);     // 'Product', 'Order', etc.
  console.log(event.data);       // The created/updated object
  console.log(event.timestamp);  // '2026-08-03T10:00:00Z'
});

// Listen to events for a SPECIFIC entity type
const unsubProducts = client.subscribe<Product>('/topic/products', (event) => {
  if (event.type === 'ENTITY_CREATED') {
    console.log('New product:', event.data.name);
  }
  if (event.type === 'ENTITY_UPDATED') {
    console.log('Updated:', event.data.id, '→', event.data.price);
  }
});

// Stop listening (call the returned function)
unsubProducts();

// Clean up everything when leaving the app
client.dispose();
```

**Key behaviors:**
- **Lazy connection**: WebSocket connects only when you call `subscribe()`. No waste if unused.
- **Auto-reconnect**: If the connection drops (network issue, server restart), the SDK reconnects with exponential backoff and re-sends all subscriptions.
- **Auto-disconnect**: When all subscriptions are removed, the WebSocket closes.
- **Topic format**: `/topic/entities` (all) or `/topic/{entity-name-lowercase}` (specific).

---

## Error handling

```typescript
import { HttpError, RateLimitError, TimeoutError, NetworkError } from '@flashapi/client';

try {
  await products.get(9999);
} catch (error) {
  if (error instanceof HttpError) {
    // Server returned an error (4xx or 5xx)
    console.log(error.status);     // 404
    console.log(error.message);    // "Not found"
    console.log(error.body);       // { error: "Not found", status: 404 }

    switch (error.status) {
      case 401: // Token invalid or expired → redirect to login
        window.location.href = '/login';
        break;
      case 403: // Authenticated but insufficient permissions
        alert('You do not have access to this resource');
        break;
      case 404: // Resource not found (or cross-tenant access blocked)
        alert('Not found');
        break;
    }
  }

  if (error instanceof RateLimitError) {
    // Server returned 429 even after automatic retries
    console.log(error.rateLimit.limit);     // 100
    console.log(error.rateLimit.remaining); // 0
    console.log(error.retryAfter);          // 60 (seconds to wait)
  }

  if (error instanceof TimeoutError) {
    // Request took longer than the configured timeout
    console.log(error.timeout); // 30000 (ms)
  }

  if (error instanceof NetworkError) {
    // Cannot reach the server (DNS failure, no internet, server down)
    console.log(error.originalCause); // The underlying fetch error
  }
}
```

**Error hierarchy:**
```
FlashError (base)
├── HttpError          (any non-2xx response from server)
│   └── RateLimitError (429 specifically, after all retries exhausted)
├── TimeoutError       (request exceeded timeout)
└── NetworkError       (couldn't reach the server at all)
```

---

## Request cancellation

Use `AbortSignal` (the standard Web API) to cancel in-flight requests.

```typescript
const controller = new AbortController();

// Pass signal as the last argument to any method
const promise = products.list({ search: 'key' }, controller.signal);

// Cancel the request
controller.abort();
// The promise rejects with a DOMException (name: 'AbortError')
```

**Practical example — search with debounce:**

```typescript
let currentController: AbortController | null = null;

async function onSearchInput(query: string) {
  // Cancel the previous in-flight search
  currentController?.abort();
  currentController = new AbortController();

  try {
    const results = await products.list(
      { search: query },
      currentController.signal,
    );
    renderResults(results.data);
  } catch (error) {
    // AbortError is expected when we cancel — ignore it
    if (error instanceof DOMException && error.name === 'AbortError') return;
    throw error;
  }
}
```

---

## Rate limiting

The SDK handles 429 responses automatically:

1. Receives HTTP 429 from the server
2. Reads the `Retry-After` header (or computes exponential backoff with jitter)
3. Waits
4. Retries the request

This repeats up to `retries` times (default: 3). If still 429 after all retries, a `RateLimitError` is thrown.

**You don't need to do anything.** It just works.

Configure retry behavior:
```typescript
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  retries: 5,       // 5 attempts instead of 3
  timeout: 60000,   // 60s timeout instead of 30s
});
```

---

## Debug mode

Enable debug logging to see what the SDK is doing:

```typescript
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  debug: true,
});
```

Output (in browser console or Node.js stderr):
```
[flashapi] GET products { attempt: 0 }
[flashapi] GET products/42 { attempt: 0 }
[flashapi] POST products { attempt: 0 }
[flashapi] Rate limited, retrying in 1523ms
[flashapi] GET products { attempt: 1 }
[flashapi:ws] Connecting...
[flashapi:ws] Connected
[flashapi:ws] Disconnected
[flashapi:ws] Reconnecting in 1200ms (attempt 1)
```

Custom logger:
```typescript
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  debug: true,
  logger: (message, context) => {
    myLoggingService.log(message, context);
  },
});
```

---

## CORS — the #1 frontend issue

If your frontend runs on a different origin than your backend (e.g., `http://localhost:3000` → `http://localhost:8000`), the browser will block requests unless the backend sends CORS headers.

**Symptom:** You see `TypeError: Failed to fetch` or `CORS policy` errors in the browser console. The SDK throws a `NetworkError`.

**Solution: configure CORS on your backend.** This is NOT something the SDK can fix.

**Python (FastAPI):**
```python
from fastapi.middleware.cors import CORSMiddleware

app = flash.app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your frontend URL
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Python (Django):**
```bash
pip install django-cors-headers
```
```python
# settings.py
INSTALLED_APPS = [..., "corsheaders"]
MIDDLEWARE = ["corsheaders.middleware.CorsMiddleware", ...]
CORS_ALLOWED_ORIGINS = ["http://localhost:3000"]
```

**Python (Flask):**
```bash
pip install flask-cors
```
```python
from flask_cors import CORS
CORS(app, origins=["http://localhost:3000"])
```

**Java (Spring Boot):**
The spring-flashapi library handles this — check its docs.

---

## Using with React

**Basic (useEffect):**
```tsx
import { useState, useEffect } from 'react';
import { FlashClient } from '@flashapi/client';

// Create the client ONCE, outside components
const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  auth: {
    type: 'custom',
    interceptor: (headers) => {
      const token = localStorage.getItem('token');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  },
});

interface Product {
  id: number;
  name: string;
  price: number;
}

function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const resource = client.entity<Product>('products');

    resource.list({ page: 0, size: 20 }, controller.signal)
      .then(result => {
        setProducts(result.data);
        setLoading(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') return; // Component unmounted
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort(); // Cleanup on unmount
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <ul>
      {products.map(p => <li key={p.id}>{p.name} — ${p.price}</li>)}
    </ul>
  );
}
```

**With TanStack Query (recommended for production apps):**
```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const resource = client.entity<Product>('products');

function ProductList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products', { page: 0 }],
    queryFn: ({ signal }) => resource.list({ page: 0, size: 20 }, signal),
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data!.data.map(p => <li key={p.id}>{p.name} — ${p.price}</li>)}
    </ul>
  );
}

function CreateProductButton() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (product: Partial<Product>) => resource.create(product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <button onClick={() => mutation.mutate({ name: 'New', price: 9.99 })}>
      Add product
    </button>
  );
}
```

---

## Using with Vue

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { FlashClient } from '@flashapi/client';

const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  auth: {
    type: 'custom',
    interceptor: (headers) => {
      const token = localStorage.getItem('token');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  },
});

interface Product {
  id: number;
  name: string;
  price: number;
}

const products = ref<Product[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const controller = new AbortController();

onMounted(async () => {
  try {
    const resource = client.entity<Product>('products');
    const result = await resource.list({ page: 0 }, controller.signal);
    products.value = result.data;
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      error.value = err.message;
    }
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => controller.abort());
</script>

<template>
  <p v-if="loading">Loading...</p>
  <p v-else-if="error">Error: {{ error }}</p>
  <ul v-else>
    <li v-for="p in products" :key="p.id">{{ p.name }} — ${{ p.price }}</li>
  </ul>
</template>
```

---

## Using with Node.js (server-side)

For scripts, cron jobs, or a backend calling another FlashAPI backend:

```typescript
import { FlashClient } from '@flashapi/client';

const client = new FlashClient({
  baseUrl: 'http://production-server:8080/api',
  auth: { type: 'header', name: 'X-API-Key', value: process.env.FLASHAPI_KEY! },
});

// Example: iterate all pages
async function exportAllProducts() {
  const products = client.entity<Product>('products');
  const allProducts: Product[] = [];

  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const result = await products.list({ page, size: 100 });
    allProducts.push(...result.data);
    totalPages = result.meta.totalPages;
    page++;
  }

  return allProducts;
}
```

**WebSocket in Node.js (Node < 21 has no native WebSocket):**

```bash
npm install ws
```

```typescript
import WebSocket from 'ws';
import { FlashClient } from '@flashapi/client';

const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api',
  webSocketConstructor: WebSocket as unknown as typeof globalThis.WebSocket,
});

client.subscribe('/topic/products', (event) => {
  console.log('Event:', event.type, event.data);
});
```

Node.js 21+ has native WebSocket — no extra package needed.

---

## ESM vs CommonJS imports

**ESM (recommended — default for modern projects):**
```typescript
import { FlashClient, HttpError } from '@flashapi/client';
```

**CommonJS (legacy Node.js projects):**
```javascript
const { FlashClient, HttpError } = require('@flashapi/client');
```

Both formats are included in the package. Your bundler/runtime picks the right one automatically.

---

## FAQ

### The SDK does login / register?

**No.** The SDK is a transport layer. It sends HTTP requests with the auth header you provide. Getting a token (login, OAuth, SSO) is your app's responsibility. The SDK just uses whatever token you give it.

### Do I need to create a new client for each request?

**No.** Create the client once and reuse it everywhere. If the token can change (expiration, user switch), use `auth: { type: 'custom', interceptor }` so it always reads the latest token.

### Does it work with both the Python and Java backends?

**Yes.** Both backends implement the same HTTP contract (FlashAPI Spec v1). The SDK doesn't know or care which backend is behind the URL. Same requests, same responses.

### What happens if the server is down?

The SDK retries automatically (3 times by default) on network errors, 502, 503, and 504. If it still can't connect, a `NetworkError` is thrown.

### How does multi-tenancy work on the frontend?

You don't need to do anything special. The backend automatically filters data based on the user's token. User A only sees their tenant's data. User B only sees theirs. The SDK just sends the token — the backend enforces isolation.

---

## UI Components

The SDK ships ready-to-use UI components for **React** and **Vue**. They eliminate 200+ lines of repetitive table/form boilerplate and connect directly to your FlashAPI backend.

**One package. No extra install.** The table and form components are sub-path exports of the same `@flashapi/client` package.

### Importing styles

The components use CSS classes prefixed with `.flash-table-` and `.flash-form-`. Import the included stylesheet once at your app's entry point:

```tsx
// main.tsx or App.tsx (React)
import '@flashapi/client/styles.css';
```

```ts
// main.ts (Vue)
import '@flashapi/client/styles.css';
```

The styles work standalone — no Tailwind, Bootstrap, or CSS framework needed. They're minimal, neutral, and easy to override.

---

### FlashTable (React)

```tsx
import { FlashClient } from '@flashapi/client';
import { FlashTable } from '@flashapi/client/react';
import '@flashapi/client/styles.css';

const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api/v1',
  auth: { type: 'bearer', token: 'your-jwt-token' },
});

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  grade: number;
  enrolled: boolean;
}

export function StudentsPage() {
  return (
    <FlashTable<Student>
      client={client}
      entity="students"
      columns={[
        { key: 'first_name', label: 'First Name', sortable: true },
        { key: 'last_name', label: 'Last Name', sortable: true },
        { key: 'email', label: 'Email' },
        { key: 'grade', label: 'Grade', type: 'number', sortable: true },
        { key: 'enrolled', label: 'Status', type: 'boolean' },
      ]}
      searchable
      paginated
      pageSize={25}
      deletable
      editable
      exportable
      bulkActions
      defaultSort={{ key: 'last_name', direction: 'asc' }}
      onEdit={(student) => {
        window.location.href = `/students/${student.id}/edit`;
      }}
      confirmDelete={async (student) => {
        return window.confirm(`Delete ${student.first_name} ${student.last_name}?`);
      }}
    />
  );
}
```

**That's it.** This renders a fully functional data table with:
- Paginated data from `GET /api/v1/students/`
- Column sorting (click headers)
- Full-text search (debounced 300ms)
- Edit/Delete action buttons per row
- Bulk select + bulk delete
- CSV/Excel/PDF export buttons
- Automatic refresh after mutations

#### FlashTable Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `client` | `FlashClient` | **required** | Your configured client instance |
| `entity` | `string` | **required** | Entity name (matches your backend route) |
| `columns` | `ColumnDef<T>[]` | **required** | Column definitions (see below) |
| `searchable` | `boolean` | `false` | Show search input |
| `paginated` | `boolean` | `true` | Enable pagination |
| `pageSize` | `number` | `20` | Rows per page |
| `defaultSort` | `{ key, direction }` | `null` | Initial sort |
| `filters` | `Filters` | `{}` | Pre-applied filters (e.g. `{ status: { eq: 'active' } }`) |
| `expand` | `string \| string[]` | — | Relations to expand (e.g. `'classroom'` or `['classroom', 'teacher']`) |
| `deletable` | `boolean` | `false` | Show delete button per row |
| `editable` | `boolean` | `false` | Show edit button per row |
| `creatable` | `boolean` | `false` | Show "Add" button in toolbar |
| `exportable` | `boolean` | `false` | Show CSV/Excel/PDF export buttons |
| `bulkActions` | `boolean` | `false` | Enable row checkboxes + bulk operations |
| `actions` | `TableAction<T>[]` | `[]` | Custom action buttons per row |
| `onEdit` | `(row: T) => void` | — | Called when edit button is clicked |
| `onDelete` | `(row: T) => boolean \| Promise<boolean>` | — | Interceptor before delete; return `false` to cancel |
| `onCreate` | `() => void` | — | Called when "Add" button is clicked |
| `onBulkCreate` | `() => void` | — | Called when "Bulk add" button is clicked |
| `confirmDelete` | `(row: T) => boolean \| Promise<boolean>` | — | Confirmation interceptor (controller-level) |
| `confirmBulkDelete` | `(count: number) => boolean \| Promise<boolean>` | — | Confirmation before bulk delete |
| `className` | `string` | — | CSS class on the root wrapper |
| `emptyMessage` | `string` | `'No data found'` | Message when table is empty |

#### ColumnDef

```typescript
interface ColumnDef<T> {
  key: keyof T & string;   // field name from your entity
  label: string;           // column header text
  type?: 'text' | 'number' | 'date' | 'boolean' | 'badge';
  sortable?: boolean;
  width?: string;          // CSS width (e.g. '120px', '20%')
  render?: (value: any, row: T) => ReactNode;  // custom cell renderer
}
```

#### Custom column rendering

```tsx
<FlashTable<Order>
  client={client}
  entity="orders"
  columns={[
    { key: 'id', label: '#', width: '60px' },
    { key: 'customer_name', label: 'Customer', sortable: true },
    {
      key: 'total',
      label: 'Total',
      type: 'number',
      render: (value) => `$${value.toFixed(2)}`,
    },
    {
      key: 'status',
      label: 'Status',
      type: 'badge',  // renders as a pill/badge
    },
    {
      key: 'created_at',
      label: 'Date',
      type: 'date',   // auto-formatted with toLocaleDateString()
      sortable: true,
    },
  ]}
  searchable
  paginated
/>
```

#### Custom action buttons

```tsx
<FlashTable<Invoice>
  client={client}
  entity="invoices"
  columns={columns}
  actions={[
    {
      key: 'download',
      label: 'PDF',
      onClick: (invoice) => downloadInvoice(invoice.id),
    },
    {
      key: 'send',
      label: 'Send',
      onClick: (invoice) => sendEmail(invoice),
      visible: (invoice) => invoice.status === 'pending', // conditional visibility
    },
    {
      key: 'archive',
      label: 'Archive',
      variant: 'danger',
      onClick: (invoice) => archiveInvoice(invoice.id),
    },
  ]}
/>
```

---

### FlashForm (React)

```tsx
import { FlashForm } from '@flashapi/client/react';

export function CreateStudentForm() {
  return (
    <FlashForm<Student>
      client={client}
      entity="students"
      mode="create"
      fields={[
        { key: 'first_name', label: 'First Name', required: true },
        { key: 'last_name', label: 'Last Name', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'grade', label: 'Grade', type: 'number', min: 0, max: 20 },
        {
          key: 'classroom_id',
          label: 'Classroom',
          type: 'relation',
          entity: 'classrooms',  // fetches options from GET /classrooms/
          display: 'name',       // which field to show as label
        },
        { key: 'enrolled', label: 'Active', type: 'checkbox' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      onSuccess={(student) => {
        window.location.href = `/students/${student.id}`;
      }}
      onError={(err) => {
        alert(`Failed: ${err.message}`);
      }}
      submitLabel="Create Student"
    />
  );
}
```

#### Edit mode

Pass `mode="edit"`, an `id`, and `initialData`:

```tsx
<FlashForm<Student>
  client={client}
  entity="students"
  mode="edit"
  id={studentId}
  initialData={existingStudent}
  fields={fields}
  onSuccess={() => navigate('/students')}
  submitLabel="Save Changes"
/>
```

#### FlashForm Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `client` | `FlashClient` | **required** | Your configured client |
| `entity` | `string` | **required** | Entity name |
| `fields` | `FieldDef<T>[]` | **required** | Field definitions |
| `mode` | `'create' \| 'edit'` | `'create'` | Form mode |
| `id` | `string \| number` | — | Entity ID (required in edit mode) |
| `initialData` | `Partial<T>` | — | Pre-fill values (edit mode) |
| `onSuccess` | `(data: T) => void` | — | Called after successful submit |
| `onError` | `(error: Error) => void` | — | Called on submission error |
| `submitLabel` | `string` | `'Submit'` | Submit button text |

#### FieldDef

```typescript
interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'date' | 'datetime'
       | 'textarea' | 'select' | 'checkbox' | 'relation';
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  options?: { value: string | number; label: string }[];  // for 'select' type
  entity?: string;    // for 'relation' — auto-fetches from this entity
  display?: string;   // for 'relation' — field name to show as label
  min?: number;       // for 'number' — minimum value
  max?: number;       // for 'number' — maximum value
  defaultValue?: any;
}
```

#### Validation

Built-in validation runs on submit:
- `required`: field must not be empty
- `type: 'email'`: validates email format
- `min` / `max`: validates number range

Errors appear below each field automatically.

---

### Custom delete confirmation

The `onDelete` prop is an **interceptor**. Return `false` (or a Promise that resolves to `false`) to cancel the deletion. This lets you use your own modal/dialog library:

```tsx
import { useState } from 'react';

function StudentsPage() {
  const [confirmTarget, setConfirmTarget] = useState<Student | null>(null);
  const [pendingResolve, setPendingResolve] = useState<((v: boolean) => void) | null>(null);

  return (
    <>
      <FlashTable<Student>
        client={client}
        entity="students"
        columns={columns}
        deletable
        onDelete={(student) => {
          // Return a Promise — the table waits for your answer
          return new Promise<boolean>((resolve) => {
            setConfirmTarget(student);
            setPendingResolve(() => resolve);
          });
        }}
      />

      {/* Your custom modal */}
      {confirmTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Are you sure you want to delete {confirmTarget.first_name}?</p>
            <button onClick={() => { pendingResolve?.(true); setConfirmTarget(null); }}>
              Yes, delete
            </button>
            <button onClick={() => { pendingResolve?.(false); setConfirmTarget(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

#### confirmDelete vs onDelete

| Prop | Where it runs | Purpose |
|------|---------------|---------|
| `onDelete` | In the React component, before the controller | UI-level interceptor — show your own popup |
| `confirmDelete` | In the controller, after `onDelete` passes | Logic-level confirmation — useful with headless hook too |

Both must return `true` for the delete to proceed. If you only need a simple `window.confirm()`, use `confirmDelete` alone:

```tsx
<FlashTable
  deletable
  confirmDelete={(student) => window.confirm(`Delete ${student.first_name}?`)}
/>
```

---

### Bulk operations in the table

Enable with `bulkActions`:

```tsx
<FlashTable<Product>
  client={client}
  entity="products"
  columns={columns}
  bulkActions
  confirmBulkDelete={(count) => {
    return window.confirm(`Delete ${count} products?`);
  }}
/>
```

When `bulkActions` is enabled:
1. Checkboxes appear on each row
2. A "select all" checkbox appears in the header
3. When rows are selected, a toolbar shows: "3 selected | Delete selected | Clear"
4. `confirmBulkDelete` fires before the `DELETE /products/bulk/` request

---

### Export from the table

Enable with `exportable`:

```tsx
<FlashTable<Product>
  client={client}
  entity="products"
  columns={columns}
  exportable
/>
```

Three buttons appear: **CSV**, **Excel**, **PDF**. They call `GET /products/export/?format=csv` (or xlsx/pdf) and trigger a browser download. Current sort and filters are included in the export request.

---

### Vue composables

The Vue integration provides the same functionality through composables:

```vue
<script setup lang="ts">
import { FlashClient } from '@flashapi/client';
import { useFlashTable, useFlashForm } from '@flashapi/client/vue';
import type { ColumnDef, FieldDef } from '@flashapi/client/vue';
import '@flashapi/client/styles.css';

const client = new FlashClient({
  baseUrl: 'http://localhost:8000/api/v1',
  auth: { type: 'bearer', token: localStorage.getItem('token')! },
});

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  grade: number;
}

const columns: ColumnDef<Student>[] = [
  { key: 'first_name', label: 'First Name', sortable: true },
  { key: 'last_name', label: 'Last Name', sortable: true },
  { key: 'email', label: 'Email' },
  { key: 'grade', label: 'Grade', type: 'number', sortable: true },
];

const table = useFlashTable<Student>({
  client,
  entity: 'students',
  columns,
  searchable: true,
  paginated: true,
  pageSize: 25,
  deletable: true,
  exportable: true,
  bulkActions: true,
  confirmDelete: (student) => window.confirm(`Delete ${student.first_name}?`),
  confirmBulkDelete: (count) => window.confirm(`Delete ${count} students?`),
});
</script>

<template>
  <div class="flash-table-root">
    <!-- Toolbar -->
    <div class="flash-table-toolbar">
      <input
        v-if="table.config.searchable"
        type="text"
        placeholder="Search..."
        class="flash-table-search"
        @input="table.setSearch(($event.target as HTMLInputElement).value)"
      />
      <div class="flash-table-toolbar-right">
        <span v-if="table.selectedRows.value.length > 0" class="flash-table-selected-count">
          {{ table.selectedRows.value.length }} selected
        </span>
        <button v-if="table.selectedRows.value.length > 0" @click="table.bulkDelete()" class="flash-table-bulk-btn flash-table-bulk-delete">
          Delete selected
        </button>
        <div v-if="table.config.exportable" class="flash-table-export">
          <button @click="table.downloadExport('csv')" class="flash-table-export-btn">CSV</button>
          <button @click="table.downloadExport('xlsx')" class="flash-table-export-btn">Excel</button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="flash-table-wrapper">
      <table class="flash-table">
        <thead>
          <tr>
            <th v-if="table.config.bulkActions" class="flash-table-checkbox-col">
              <input type="checkbox" @change="table.selectAll()" />
            </th>
            <th
              v-for="col in columns"
              :key="col.key"
              :class="{ 'flash-table-sortable': col.sortable }"
              @click="col.sortable && table.setSort(col.key)"
            >
              {{ col.label }}
              <span v-if="table.sort.value?.key === col.key" class="flash-table-sort-icon">
                {{ table.sort.value.direction === 'asc' ? '↑' : '↓' }}
              </span>
            </th>
            <th v-if="table.config.deletable">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="table.loading.value && table.data.value.length === 0">
            <td :colspan="columns.length + 2" class="flash-table-loading">Loading...</td>
          </tr>
          <tr v-else-if="table.data.value.length === 0">
            <td :colspan="columns.length + 2" class="flash-table-empty">No data found</td>
          </tr>
          <tr v-else v-for="row in table.data.value" :key="(row as any).id">
            <td v-if="table.config.bulkActions" class="flash-table-checkbox-col">
              <input type="checkbox" @change="table.selectRow(row)" />
            </td>
            <td v-for="col in columns" :key="col.key">{{ (row as any)[col.key] }}</td>
            <td v-if="table.config.deletable" class="flash-table-actions">
              <button @click="table.deleteRow(row)" class="flash-table-action-btn flash-table-action-danger">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="table.totalPages.value > 1" class="flash-table-pagination">
      <button @click="table.setPage(table.page.value - 1)" :disabled="table.page.value === 0" class="flash-table-page-btn">
        Previous
      </button>
      <span class="flash-table-page-info">
        Page {{ table.page.value + 1 }} of {{ table.totalPages.value }}
      </span>
      <button @click="table.setPage(table.page.value + 1)" :disabled="table.page.value >= table.totalPages.value - 1" class="flash-table-page-btn">
        Next
      </button>
    </div>
  </div>
</template>
```

#### Vue Form example

```vue
<script setup lang="ts">
import { useFlashForm } from '@flashapi/client/vue';
import type { FieldDef } from '@flashapi/client/vue';

const fields: FieldDef<Student>[] = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'grade', label: 'Grade', type: 'number', min: 0, max: 20 },
];

const form = useFlashForm<Student>({
  client,
  entity: 'students',
  fields,
  mode: 'create',
  onSuccess: (student) => {
    router.push(`/students/${student.id}`);
  },
});
</script>

<template>
  <form class="flash-form" @submit.prevent="form.submit()">
    <div v-for="field in fields" :key="field.key" class="flash-form-field"
      :class="{ 'flash-form-field-error': form.errors.value[field.key] }">
      <label class="flash-form-label">
        {{ field.label }}
        <span v-if="field.required" class="flash-form-required">*</span>
      </label>
      <input
        v-if="!field.type || field.type === 'text' || field.type === 'email' || field.type === 'number'"
        :type="field.type || 'text'"
        :value="form.values.value[field.key]"
        @input="form.setValue(field.key, ($event.target as HTMLInputElement).value)"
        class="flash-form-input"
      />
      <span v-if="form.errors.value[field.key]" class="flash-form-error-text">
        {{ form.errors.value[field.key] }}
      </span>
    </div>
    <div class="flash-form-actions">
      <button type="submit" :disabled="form.submitting.value" class="flash-form-submit">
        Create Student
      </button>
    </div>
  </form>
</template>
```

#### useFlashTable return value (Vue)

| Property | Type | Description |
|----------|------|-------------|
| `data` | `Ref<T[]>` | Current page rows |
| `loading` | `Ref<boolean>` | Loading state |
| `error` | `Ref<string \| null>` | Error message |
| `page` | `Ref<number>` | Current page (0-indexed) |
| `totalPages` | `Ref<number>` | Total pages |
| `totalElements` | `Ref<number>` | Total row count |
| `search` | `Ref<string>` | Current search query |
| `sort` | `Ref<{ key, direction } \| null>` | Current sort |
| `selectedRows` | `Ref<T[]>` | Selected rows |
| `setPage(n)` | Function | Navigate to page |
| `setSearch(q)` | Function | Set search query |
| `setSort(key)` | Function | Toggle sort on column |
| `setFilters(f)` | Function | Apply filters |
| `selectRow(row)` | Function | Toggle row selection |
| `selectAll()` | Function | Toggle select all |
| `clearSelection()` | Function | Clear selection |
| `deleteRow(row)` | Function | Delete single row |
| `bulkDelete()` | Function | Delete selected rows |
| `downloadExport(format)` | Function | Download CSV/XLSX/PDF |
| `refresh()` | Function | Re-fetch current page |

#### useFlashForm return value (Vue)

| Property | Type | Description |
|----------|------|-------------|
| `values` | `Ref<Partial<T>>` | Current form values |
| `errors` | `Ref<Record<string, string>>` | Validation errors |
| `loading` | `Ref<boolean>` | Loading relation options |
| `submitting` | `Ref<boolean>` | Submit in progress |
| `setValue(key, value)` | Function | Set a field value |
| `submit()` | Function | Validate and submit |
| `reset()` | Function | Reset to initial values |
| `relationOptions` | `Ref<Record<string, SelectOption[]>>` | Loaded relation options |

---

### What about caching?

The SDK does NOT cache. For client-side caching (avoid refetching, stale-while-revalidate, optimistic updates), use:
- [TanStack Query](https://tanstack.com/query) (React, Vue, Svelte, Solid)
- [SWR](https://swr.vercel.app/) (React)
- Or any state management library

These libraries complement the SDK — they call it, cache the results, and handle invalidation.

### What's the bundle size?

**3.3 KB gzipped.** Zero dependencies. Tree-shakeable — if you don't use WebSocket, it's excluded from your bundle.

### Can I use it without TypeScript?

Yes. Works in plain JavaScript. You just lose autocomplete and type checking:
```javascript
const { FlashClient } = require('@flashapi/client');
const client = new FlashClient({ baseUrl: 'http://localhost:8000/api' });
const products = client.entity('products');
const result = await products.list();
```
