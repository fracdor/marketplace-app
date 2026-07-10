import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema, type ProfileInput } from '@/features/auth/schemas';
import { mapAuthError } from '@/features/auth/errors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface ProfileFormProps {
  onSubmit: (input: ProfileInput) => Promise<void>;
  initialValues?: ProfileInput;
  submitLabel?: string;
}

export function ProfileForm({ onSubmit, initialValues, submitLabel = 'Continuar' }: ProfileFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialValues ?? { full_name: '', city: '' },
  });
  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setSubmitError(e instanceof Error ? mapAuthError(e.message) : 'Error');
    }
  });
  return (
    <View>
      <Controller
        control={control}
        name="full_name"
        render={({ field, fieldState }) => (
          <Input
            label="Nombre completo"
            testID="name-input"
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
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label={submitLabel} onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
