import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

export function Card({ className, children, ...props }: ViewProps & { className?: string }) {
  return (
    <View className={cn('bg-white/95 rounded-2xl p-5 shadow-lg', className)} {...props}>
      {children}
    </View>
  );
}
