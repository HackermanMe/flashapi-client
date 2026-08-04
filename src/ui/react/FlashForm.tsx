import { useEffect, useState, type FormEvent } from 'react';
import type { FieldDef, FormConfig, SelectOption } from '../types.js';
import { useFlashForm } from './use-form.js';

export interface FlashFormProps<T = any> extends FormConfig<T> {
  className?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
}

export function FlashForm<T = any>(props: FlashFormProps<T>) {
  const {
    className,
    submitLabel,
    cancelLabel = 'Cancel',
    onCancel,
    fields,
    ...config
  } = props;

  const formConfig: FormConfig<T> = { ...config, fields };
  const form = useFlashForm<T>(formConfig);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    form.submit();
  };

  const label = submitLabel ?? (form.mode === 'edit' ? 'Update' : 'Create');

  return (
    <form onSubmit={handleSubmit} className={`flash-form ${className ?? ''}`}>
      {fields.map(field => (
        <FieldInput
          key={field.key}
          field={field}
          value={(form.values as any)[field.key]}
          error={(form.errors as any)[field.key]}
          onChange={(value) => form.setValue(field.key, value)}
          loadOptions={() => form.loadRelationOptions(field)}
          disabled={field.disabled || form.submitting}
        />
      ))}

      <div className="flash-form-actions">
        <button
          type="submit"
          disabled={form.submitting}
          className="flash-form-submit"
        >
          {form.submitting ? 'Saving...' : label}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flash-form-cancel"
            disabled={form.submitting}
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
  );
}

interface FieldInputProps<T = any> {
  field: FieldDef<T>;
  value: any;
  error?: string;
  onChange: (value: any) => void;
  loadOptions: () => Promise<SelectOption[]>;
  disabled?: boolean;
}

function FieldInput<T>({ field, value, error, onChange, loadOptions, disabled }: FieldInputProps<T>) {
  const [options, setOptions] = useState<SelectOption[]>(field.options ?? []);

  useEffect(() => {
    if (field.type === 'relation' && !field.options) {
      loadOptions().then(setOptions);
    }
  }, [field.type, field.entity]);

  const inputId = `flash-form-${field.key}`;

  return (
    <div className={`flash-form-field ${error ? 'flash-form-field-error' : ''}`}>
      <label htmlFor={inputId} className="flash-form-label">
        {field.label}
        {field.required && <span className="flash-form-required">*</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          id={inputId}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className="flash-form-textarea"
        />
      ) : field.type === 'select' || field.type === 'relation' ? (
        <select
          id={inputId}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="flash-form-select"
        >
          <option value="">Select {field.label}...</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <input
          id={inputId}
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          className="flash-form-checkbox"
        />
      ) : (
        <input
          id={inputId}
          type={mapFieldType(field.type)}
          value={value ?? ''}
          onChange={e => onChange(field.type === 'number' ? Number(e.target.value) || '' : e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          min={field.min}
          max={field.max}
          className="flash-form-input"
        />
      )}

      {error && <span className="flash-form-error-text">{error}</span>}
    </div>
  );
}

function mapFieldType(type?: string): string {
  switch (type) {
    case 'number': return 'number';
    case 'email': return 'email';
    case 'password': return 'password';
    case 'date': return 'date';
    case 'datetime': return 'datetime-local';
    default: return 'text';
  }
}
