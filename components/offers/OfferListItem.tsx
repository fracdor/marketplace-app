import { Pressable, Text, View } from 'react-native';
import { formatBudget } from '@/features/tasks/format';
import type { OfferWithFreelancer } from '@/features/offers/types';

interface OfferListItemProps {
  offer: OfferWithFreelancer;
  onAccept: () => void;
  disabled?: boolean;
}

export function OfferListItem({ offer, onAccept, disabled }: OfferListItemProps) {
  return (
    <View
      testID="offer-list-item"
      className="bg-slate-50 rounded-2xl p-3 mb-2 flex-row justify-between items-center"
    >
      <View className="flex-1 pr-2">
        <Text className="text-slate-900 font-bold text-sm">
          {offer.freelancer.full_name ?? 'Anónimo'} · {formatBudget(offer.price)}
        </Text>
        {offer.message ? <Text className="text-slate-500 text-xs mt-1">{offer.message}</Text> : null}
      </View>
      <Pressable
        testID="accept-offer-button"
        accessibilityRole="button"
        onPress={onAccept}
        disabled={disabled}
        className={disabled ? 'bg-slate-300 px-3 py-2 rounded-xl' : 'bg-brand px-3 py-2 rounded-xl'}
      >
        <Text className="text-white font-bold text-xs">Aceptar</Text>
      </Pressable>
    </View>
  );
}
