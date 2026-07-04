import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, ...props }: InputProps) {
  return (
    <View className="mb-3">
      <Text className="text-xs text-slate-600 mb-1">{label}</Text>
      <TextInput
        className={cn(
          'h-11 rounded-xl border px-3 bg-white',
          error ? 'border-red-400' : 'border-slate-200',
        )}
        placeholderTextColor="#94a3b8"
        {...props}
      />
      {error ? <Text className="text-xs text-red-500 mt-1">{error}</Text> : null}
    </View>
  );
}
