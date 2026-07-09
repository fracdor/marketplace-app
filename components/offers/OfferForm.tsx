import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOfferSchema, type CreateOfferFormValues } from '@/features/offers/schemas';
import { mapAuthError } from '@/features/auth/errors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { CreateOfferInput } from '@/features/offers/types';

interface OfferFormProps {
  taskId: string;
  onSubmit: (input: CreateOfferInput) => Promise<void>;
}

export function OfferForm({ taskId, onSubmit }: OfferFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<CreateOfferFormValues>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: { price: '', message: '' },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit({
        task_id: taskId,
        price: Number(values.price),
        message: values.message.trim() === '' ? null : values.message,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? mapAuthError(e.message) : 'Error al enviar la oferta');
    }
  });

  return (
    <ScrollView>
      <Controller
        control={control}
        name="price"
        render={({ field, fieldState }) => (
          <Input
            label="Precio ($COP)"
            testID="price-input"
            keyboardType="numeric"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="message"
        render={({ field, fieldState }) => (
          <Input
            label="Mensaje (opcional)"
            testID="message-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
            multiline
          />
        )}
      />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Enviar oferta" onPress={submit} loading={formState.isSubmitting} />
    </ScrollView>
  );
}
