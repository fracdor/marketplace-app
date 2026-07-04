import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@/features/auth/schemas';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface RegisterFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values.email, values.password);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al crear la cuenta');
    }
  });

  return (
    <View>
      <Controller control={control} name="email" render={({ field, fieldState }) => (
        <Input label="Correo" testID="email-input" autoCapitalize="none" keyboardType="email-address"
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      <Controller control={control} name="password" render={({ field, fieldState }) => (
        <Input label="Contraseña" testID="password-input" secureTextEntry
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      <Controller control={control} name="confirm" render={({ field, fieldState }) => (
        <Input label="Confirmar contraseña" testID="confirm-input" secureTextEntry
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Crear cuenta" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
