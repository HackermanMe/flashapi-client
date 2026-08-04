import { onUnmounted, ref, type Ref } from 'vue';
import { FormController } from '../form-controller.js';
import type { FieldDef, FormConfig, FormMode, FormState } from '../types.js';

export function useFlashForm<T = any>(config: FormConfig<T>) {
  const controller = new FormController<T>(config);
  const state: Ref<FormState<T>> = ref(controller.getState()) as Ref<FormState<T>>;

  const unsub = controller.subscribe((newState) => {
    state.value = newState;
  });

  onUnmounted(() => {
    unsub();
    controller.destroy();
  });

  return {
    state,
    mode: controller.getMode() as FormMode,
    setValue: (key: keyof T & string, value: any) => controller.setValue(key, value),
    setValues: (values: Partial<T>) => controller.setValues(values),
    submit: () => controller.submit(),
    reset: () => controller.reset(),
    validate: () => controller.validate(),
    loadRelationOptions: (field: FieldDef<T>) => controller.loadRelationOptions(field),
  };
}
