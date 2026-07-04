import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { phoneSchema, type PhoneInput } from '@/features/auth/schemas';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface PhoneFormProps {
  onSubmit: (phone: string) => Promise<void>;
}

export function PhoneForm({ onSubmit }: PhoneFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<PhoneInput>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });
  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values.phone);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error');
    }
  });
  return (
    <View>
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <Input
            label="Celular (10 dígitos)"
            testID="phone-input"
            keyboardType="number-pad"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Enviar código" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
