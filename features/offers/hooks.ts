import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOffersForTask, fetchMyOffers, createOffer, withdrawOffer, acceptOffer } from '@/features/offers/api';
import { useAuth } from '@/features/auth/useAuth';
import { taskKeys } from '@/features/tasks/hooks';
import type { CreateOfferInput } from '@/features/offers/types';

export const offerKeys = {
  all: ['offers'] as const,
  forTask: (taskId: string) => [...offerKeys.all, 'task', taskId] as const,
  mine: () => [...offerKeys.all, 'mine'] as const,
};

export function useOffersForTask(taskId: string) {
  return useQuery({
    queryKey: offerKeys.forTask(taskId),
    queryFn: () => fetchOffersForTask(taskId),
  });
}

export function useMyOffers() {
  const { session } = useAuth();
  return useQuery({
    queryKey: offerKeys.mine(),
    // Safe non-null assertion: only mounted inside (tabs)/* screens, which
    // never render before the session is resolved (traced in the plan's
    // "Before you start").
    queryFn: () => fetchMyOffers(session!.user.id),
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (input: CreateOfferInput) => {
      if (!session) throw new Error('No hay sesión activa');
      return createOffer(session.user.id, input);
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: offerKeys.forTask(input.task_id) });
      queryClient.invalidateQueries({ queryKey: offerKeys.mine() });
    },
  });
}

export function useWithdrawOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId }: { offerId: string; taskId: string }) => withdrawOffer(offerId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: offerKeys.forTask(variables.taskId) });
      queryClient.invalidateQueries({ queryKey: offerKeys.mine() });
    },
  });
}

export function useAcceptOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId }: { offerId: string; taskId: string }) => acceptOffer(offerId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: offerKeys.forTask(variables.taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
