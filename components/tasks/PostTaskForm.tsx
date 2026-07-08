import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postTaskSchema, type PostTaskFormValues } from '@/features/tasks/schemas';
import { useCategories } from '@/features/tasks/hooks';
import { mapAuthError } from '@/features/auth/errors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { CreateTaskInput } from '@/features/tasks/types';

interface PostTaskFormProps {
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}

export function PostTaskForm({ onSubmit }: PostTaskFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const { data: categories } = useCategories();
  const { control, handleSubmit, formState, setValue, watch } = useForm<PostTaskFormValues>({
    resolver: zodResolver(postTaskSchema),
    defaultValues: {
      category_id: 0,
      title: '',
      description: '',
      budget_reference: '',
      city: '',
      address_approx: '',
    },
  });

  const selectedCategoryId = watch('category_id');
  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit({
        category_id: values.category_id,
        title: values.title,
        description: values.description,
        budget_reference: values.budget_reference === '' ? null : Number(values.budget_reference),
        city: values.city,
        address_approx: values.address_approx.trim() === '' ? null : values.address_approx,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? mapAuthError(e.message) : 'Error al publicar la tarea');
    }
  });

  return (
    <ScrollView>
      <Controller
        control={control}
        name="category_id"
        render={({ fieldState }) => (
          <View className="mb-3">
            <Text className="text-xs text-slate-600 mb-1">Categoría</Text>
            <Pressable
              testID="category-picker"
              onPress={() => setCategoryModalOpen(true)}
              className="h-11 rounded-xl border border-slate-200 px-3 bg-white justify-center"
            >
              <Text className={selectedCategory ? 'text-slate-900' : 'text-slate-400'}>
                {selectedCategory?.name ?? 'Selecciona una categoría'}
              </Text>
            </Pressable>
            {fieldState.error ? (
              <Text className="text-xs text-red-500 mt-1">{fieldState.error.message}</Text>
            ) : null}
          </View>
        )}
      />

      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setCategoryModalOpen(false)}>
          <View className="bg-white rounded-t-2xl p-4">
            <Text className="text-base font-bold text-slate-900 mb-3">Elige una categoría</Text>
            {(categories ?? []).map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => {
                  setValue('category_id', cat.id, { shouldValidate: true });
                  setCategoryModalOpen(false);
                }}
                className="py-3 px-2"
              >
                <Text className="text-sm text-slate-800">{cat.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <Input
            label="Título"
            testID="title-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field, fieldState }) => (
          <Input
            label="Descripción"
            testID="description-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
            multiline
          />
        )}
      />

      <Controller
        control={control}
        name="budget_reference"
        render={({ field, fieldState }) => (
          <Input
            label="Presupuesto de referencia (opcional)"
            testID="budget-input"
            keyboardType="numeric"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="city"
        render={({ field, fieldState }) => (
          <Input
            label="Ciudad"
            testID="city-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="address_approx"
        render={({ field, fieldState }) => (
          <Input
            label="Dirección aproximada (opcional)"
            testID="address-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Publicar" onPress={submit} loading={formState.isSubmitting} />
    </ScrollView>
  );
}
