import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { cn } from '@/lib/utils';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}

export function Button({ label, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID="button"
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      className={cn(
        'h-12 rounded-xl items-center justify-center',
        variant === 'primary' ? 'bg-brand' : 'bg-transparent',
        isDisabled && 'opacity-60',
      )}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <View>
          <Text className={cn('font-semibold', variant === 'primary' ? 'text-white' : 'text-brand')}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
