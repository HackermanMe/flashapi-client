import { EntityResource } from '../resource.js';
import type { FieldDef, FormConfig, FormMode, FormState } from './types.js';

export type FormListener<T> = (state: FormState<T>) => void;

export class FormController<T = any> {
  private readonly resource: EntityResource<T>;
  private readonly config: FormConfig<T>;
  private state: FormState<T>;
  private listeners: Set<FormListener<T>> = new Set();
  private relationOptions: Map<string, Array<{ value: string | number; label: string }>> = new Map();

  constructor(config: FormConfig<T>) {
    this.config = config;
    this.resource = config.client.entity<T>(config.entity);

    const values: Partial<T> = {};
    for (const field of config.fields) {
      if (config.initialData && (config.initialData as any)[field.key] !== undefined) {
        (values as any)[field.key] = (config.initialData as any)[field.key];
      } else if (field.defaultValue !== undefined) {
        (values as any)[field.key] = field.defaultValue;
      } else {
        (values as any)[field.key] = field.type === 'checkbox' ? false : '';
      }
    }

    this.state = {
      values,
      errors: {},
      loading: false,
      submitting: false,
    };
  }

  getState(): FormState<T> {
    return this.state;
  }

  subscribe(listener: FormListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getMode(): FormMode {
    return this.config.mode ?? (this.config.id !== undefined ? 'edit' : 'create');
  }

  setValue(key: keyof T & string, value: any): void {
    const values = { ...this.state.values, [key]: value };
    const errors = { ...this.state.errors };
    delete errors[key];
    this.update({ values, errors });
  }

  setValues(values: Partial<T>): void {
    this.update({ values: { ...this.state.values, ...values }, errors: {} });
  }

  validate(): boolean {
    const errors: Partial<Record<keyof T & string, string>> = {};

    for (const field of this.config.fields) {
      const value = (this.state.values as any)[field.key];

      if (field.required && (value === '' || value === null || value === undefined)) {
        errors[field.key] = `${field.label} is required`;
      }

      if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        errors[field.key] = 'Invalid email address';
      }

      if (field.min !== undefined && typeof value === 'number' && value < field.min) {
        errors[field.key] = `Minimum value is ${field.min}`;
      }

      if (field.max !== undefined && typeof value === 'number' && value > field.max) {
        errors[field.key] = `Maximum value is ${field.max}`;
      }
    }

    this.update({ errors });
    return Object.keys(errors).length === 0;
  }

  async submit(): Promise<boolean> {
    if (!this.validate()) return false;

    this.update({ submitting: true });

    try {
      const mode = this.getMode();
      let result: any;

      if (mode === 'edit' && this.config.id !== undefined) {
        result = await this.resource.update(this.config.id, this.state.values as Partial<T>);
      } else {
        result = await this.resource.create(this.state.values as Partial<T>);
      }

      this.update({ submitting: false });
      this.config.onSuccess?.(result.data);
      return true;
    } catch (error: any) {
      this.update({ submitting: false });
      this.config.onError?.(error);
      return false;
    }
  }

  async loadRelationOptions(field: FieldDef<T>): Promise<Array<{ value: string | number; label: string }>> {
    if (!field.entity) return [];

    const cached = this.relationOptions.get(field.key);
    if (cached) return cached;

    this.update({ loading: true });

    try {
      const relResource = this.config.client.entity<any>(field.entity);
      const result = await relResource.list({ size: 100 });
      const displayKey = field.display ?? 'name';

      const options = result.data.map((item: any) => ({
        value: item.id ?? item.tracking_id,
        label: item[displayKey] ?? String(item.id ?? item.tracking_id),
      }));

      this.relationOptions.set(field.key, options);
      this.update({ loading: false });
      return options;
    } catch {
      this.update({ loading: false });
      return [];
    }
  }

  reset(): void {
    const values: Partial<T> = {};
    for (const field of this.config.fields) {
      if (field.defaultValue !== undefined) {
        (values as any)[field.key] = field.defaultValue;
      } else {
        (values as any)[field.key] = field.type === 'checkbox' ? false : '';
      }
    }
    this.update({ values, errors: {}, submitting: false });
  }

  destroy(): void {
    this.listeners.clear();
  }

  private update(partial: Partial<FormState<T>>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
