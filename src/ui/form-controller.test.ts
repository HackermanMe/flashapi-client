import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormController } from './form-controller.js';
import type { FormConfig } from './types.js';

function createMockClient(responseData: any = { id: 1 }) {
  const mockResource = {
    create: vi.fn().mockResolvedValue({ data: responseData }),
    update: vi.fn().mockResolvedValue({ data: responseData }),
    list: vi.fn().mockResolvedValue({
      data: [
        { id: 1, name: 'Option A' },
        { id: 2, name: 'Option B' },
      ],
      meta: { page: 0, size: 100, totalElements: 2, totalPages: 1 },
    }),
  };
  return {
    client: { entity: vi.fn().mockReturnValue(mockResource) } as any,
    resource: mockResource,
  };
}

describe('FormController', () => {
  it('initializes with default values', () => {
    const { client } = createMockClient();
    const config: FormConfig = {
      client,
      entity: 'students',
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'active', label: 'Active', type: 'checkbox' },
        { key: 'score', label: 'Score', type: 'number', defaultValue: 10 },
      ],
    };
    const ctrl = new FormController(config);
    const state = ctrl.getState();
    expect(state.values).toEqual({ name: '', active: false, score: 10 });
    expect(state.errors).toEqual({});
  });

  it('initializes with initialData in edit mode', () => {
    const { client } = createMockClient();
    const config: FormConfig = {
      client,
      entity: 'students',
      fields: [{ key: 'name', label: 'Name' }],
      mode: 'edit',
      id: 1,
      initialData: { name: 'Alice' },
    };
    const ctrl = new FormController(config);
    expect(ctrl.getState().values).toEqual({ name: 'Alice' });
    expect(ctrl.getMode()).toBe('edit');
  });

  it('setValue updates a single field and clears its error', () => {
    const { client } = createMockClient();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'name', label: 'Name', required: true }],
    });
    ctrl.validate();
    expect(ctrl.getState().errors).toHaveProperty('name');
    ctrl.setValue('name', 'Bob');
    expect(ctrl.getState().values).toEqual({ name: 'Bob' });
    expect(ctrl.getState().errors).not.toHaveProperty('name');
  });

  it('validate catches required fields', () => {
    const { client } = createMockClient();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
      ],
    });
    expect(ctrl.validate()).toBe(false);
    const errors = ctrl.getState().errors;
    expect(errors['name']).toContain('required');
    expect(errors['email']).toContain('required');
  });

  it('validate catches invalid email', () => {
    const { client } = createMockClient();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'email', label: 'Email', type: 'email' }],
    });
    ctrl.setValue('email', 'not-an-email');
    expect(ctrl.validate()).toBe(false);
    expect(ctrl.getState().errors['email']).toContain('email');
  });

  it('validate catches min/max', () => {
    const { client } = createMockClient();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'score', label: 'Score', type: 'number', min: 0, max: 20 }],
    });
    ctrl.setValue('score', -1);
    expect(ctrl.validate()).toBe(false);
    expect(ctrl.getState().errors['score']).toContain('Minimum');

    ctrl.setValue('score', 25);
    expect(ctrl.validate()).toBe(false);
    expect(ctrl.getState().errors['score']).toContain('Maximum');

    ctrl.setValue('score', 15);
    expect(ctrl.validate()).toBe(true);
  });

  it('submit calls create in create mode', async () => {
    const { client, resource } = createMockClient({ id: 1, name: 'New' });
    const onSuccess = vi.fn();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'name', label: 'Name', required: true }],
      onSuccess,
    });
    ctrl.setValue('name', 'New');
    const result = await ctrl.submit();
    expect(result).toBe(true);
    expect(resource.create).toHaveBeenCalledWith({ name: 'New' });
    expect(onSuccess).toHaveBeenCalledWith({ id: 1, name: 'New' });
  });

  it('submit calls update in edit mode', async () => {
    const { client, resource } = createMockClient({ id: 5, name: 'Updated' });
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'name', label: 'Name', required: true }],
      mode: 'edit',
      id: 5,
      initialData: { name: 'Old' },
    });
    ctrl.setValue('name', 'Updated');
    await ctrl.submit();
    expect(resource.update).toHaveBeenCalledWith(5, { name: 'Updated' });
  });

  it('submit returns false on validation failure', async () => {
    const { client, resource } = createMockClient();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'name', label: 'Name', required: true }],
    });
    const result = await ctrl.submit();
    expect(result).toBe(false);
    expect(resource.create).not.toHaveBeenCalled();
  });

  it('submit calls onError on API failure', async () => {
    const mockResource = {
      create: vi.fn().mockRejectedValue(new Error('Server error')),
      update: vi.fn(),
      list: vi.fn(),
    };
    const client = { entity: vi.fn().mockReturnValue(mockResource) } as any;
    const onError = vi.fn();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'name', label: 'Name', required: true }],
      onError,
    });
    ctrl.setValue('name', 'Test');
    const result = await ctrl.submit();
    expect(result).toBe(false);
    expect(onError).toHaveBeenCalled();
    expect(ctrl.getState().submitting).toBe(false);
  });

  it('reset restores default values', () => {
    const { client } = createMockClient();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [
        { key: 'name', label: 'Name', defaultValue: 'Default' },
        { key: 'active', label: 'Active', type: 'checkbox' },
      ],
    });
    ctrl.setValue('name', 'Changed');
    ctrl.reset();
    expect(ctrl.getState().values).toEqual({ name: 'Default', active: false });
  });

  it('loadRelationOptions fetches and caches', async () => {
    const { client } = createMockClient();
    const field = { key: 'classroom_id', label: 'Classroom', type: 'relation' as const, entity: 'classrooms' };
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [field],
    });
    const options = await ctrl.loadRelationOptions(field);
    expect(options).toEqual([
      { value: 1, label: 'Option A' },
      { value: 2, label: 'Option B' },
    ]);
    const cached = await ctrl.loadRelationOptions(field);
    expect(cached).toBe(options);
  });

  it('notifies listeners on state changes', () => {
    const { client } = createMockClient();
    const ctrl = new FormController({
      client,
      entity: 'students',
      fields: [{ key: 'name', label: 'Name' }],
    });
    const listener = vi.fn();
    ctrl.subscribe(listener);
    ctrl.setValue('name', 'Test');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      values: { name: 'Test' },
    }));
  });
});
