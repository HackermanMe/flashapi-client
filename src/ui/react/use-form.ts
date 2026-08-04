import { useCallback, useEffect, useRef, useState } from 'react';
import { FormController } from '../form-controller.js';
import type { FieldDef, FormConfig, FormState } from '../types.js';

export function useFlashForm<T = any>(config: FormConfig<T>) {
  const controllerRef = useRef<FormController<T> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new FormController<T>(config);
  }

  const [state, setState] = useState<FormState<T>>(controllerRef.current.getState());

  useEffect(() => {
    const controller = controllerRef.current!;
    const unsub = controller.subscribe(setState);
    return () => {
      unsub();
      controller.destroy();
    };
  }, []);

  const setValue = useCallback(
    (key: keyof T & string, value: any) => controllerRef.current!.setValue(key, value),
    [],
  );
  const setValues = useCallback(
    (values: Partial<T>) => controllerRef.current!.setValues(values),
    [],
  );
  const submit = useCallback(() => controllerRef.current!.submit(), []);
  const reset = useCallback(() => controllerRef.current!.reset(), []);
  const validate = useCallback(() => controllerRef.current!.validate(), []);
  const loadRelationOptions = useCallback(
    (field: FieldDef<T>) => controllerRef.current!.loadRelationOptions(field),
    [],
  );

  return {
    ...state,
    mode: controllerRef.current.getMode(),
    setValue,
    setValues,
    submit,
    reset,
    validate,
    loadRelationOptions,
  };
}
