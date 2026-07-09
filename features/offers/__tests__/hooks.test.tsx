import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOffersForTask, useMyOffers, useCreateOffer, useWithdrawOffer, useAcceptOffer } from '@/features/offers/hooks';
import type { CreateOfferInput, MyOfferWithTask, OfferWithFreelancer } from '@/features/offers/types';

jest.mock('@/features/offers/api', () => ({
  fetchOffersForTask: jest.fn(),
  fetchMyOffers: jest.fn(),
  createOffer: jest.fn(),
  withdrawOffer: jest.fn(),
  acceptOffer: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

// features/offers/hooks.ts imports taskKeys from @/features/tasks/hooks,
// which (transitively, via @/features/tasks/api) imports the real
// @/lib/supabase client. That module reads EXPO_PUBLIC_SUPABASE_URL at
// import time and throws when it's unset, which it always is under Jest
// (see lib/env.ts). Mocking @/features/tasks/api here — the same technique
// features/tasks/__tests__/hooks.test.tsx already uses — keeps the real
// taskKeys object (a plain const, safe to import) while cutting off the
// chain before it reaches lib/supabase.
jest.mock('@/features/tasks/api', () => ({
  fetchOpenTasks: jest.fn(),
  fetchTaskById: jest.fn(),
  fetchCategories: jest.fn(),
  createTask: jest.fn(),
}));

import { fetchOffersForTask, fetchMyOffers, createOffer, withdrawOffer, acceptOffer } from '@/features/offers/api';
import { useAuth } from '@/features/auth/useAuth';

// RNTL 14: render is async; queries come off the global `screen`, not the
// render() return value (see features/tasks/__tests__/hooks.test.tsx for the
// established pattern in this codebase).
async function renderWithClient(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}

const sampleOffer: OfferWithFreelancer = {
  id: 'o1',
  task_id: 't1',
  freelancer_id: 'u2',
  price: 85000,
  message: null,
  status: 'pending',
  created_at: '2026-07-09T10:00:00.000Z',
  freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
};

const sampleMyOffer: MyOfferWithTask = {
  ...sampleOffer,
  task: { id: 't1', title: 'Arreglar fuga', city: 'Bogotá', status: 'open' },
};

const sampleInput: CreateOfferInput = { task_id: 't1', price: 85000, message: null };

function OffersForTaskProbe({ taskId }: { taskId: string }) {
  const { data, isPending } = useOffersForTask(taskId);
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} ofertas</Text>;
}

function MyOffersProbe() {
  const { data, isPending } = useMyOffers();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} mis ofertas</Text>;
}

function CreateOfferProbe() {
  const mutation = useCreateOffer();
  if (mutation.isSuccess) return <Text>created</Text>;
  return <Text onPress={() => mutation.mutate(sampleInput)}>submit</Text>;
}

function WithdrawOfferProbe() {
  const mutation = useWithdrawOffer();
  if (mutation.isSuccess) return <Text>withdrawn</Text>;
  return <Text onPress={() => mutation.mutate({ offerId: 'o1', taskId: 't1' })}>withdraw</Text>;
}

function AcceptOfferProbe() {
  const mutation = useAcceptOffer();
  if (mutation.isSuccess) return <Text>accepted</Text>;
  return <Text onPress={() => mutation.mutate({ offerId: 'o1', taskId: 't1' })}>accept</Text>;
}

describe('useOffersForTask', () => {
  it('resolves with the offers returned by fetchOffersForTask', async () => {
    (fetchOffersForTask as jest.Mock).mockResolvedValue([sampleOffer]);
    await renderWithClient(<OffersForTaskProbe taskId="t1" />);
    await waitFor(() => expect(screen.getByText('1 ofertas')).toBeTruthy());
    expect(fetchOffersForTask).toHaveBeenCalledWith('t1');
  });
});

describe('useMyOffers', () => {
  it('resolves with the offers returned by fetchMyOffers for the current user', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    (fetchMyOffers as jest.Mock).mockResolvedValue([sampleMyOffer]);
    await renderWithClient(<MyOffersProbe />);
    await waitFor(() => expect(screen.getByText('1 mis ofertas')).toBeTruthy());
    expect(fetchMyOffers).toHaveBeenCalledWith('u2');
  });
});

describe('useCreateOffer', () => {
  it('calls createOffer with the current session user id and the input', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    (createOffer as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<CreateOfferProbe />);
    fireEvent.press(screen.getByText('submit'));
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(createOffer).toHaveBeenCalledWith('u2', sampleInput);
  });

  it('invalidates offers-for-task and my-offers on success', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    (createOffer as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<CreateOfferProbe />, client);
    fireEvent.press(screen.getByText('submit'));
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'task', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'mine'] });
  });
});

describe('useWithdrawOffer', () => {
  it('calls withdrawOffer with the offer id', async () => {
    (withdrawOffer as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<WithdrawOfferProbe />);
    fireEvent.press(screen.getByText('withdraw'));
    await waitFor(() => expect(screen.getByText('withdrawn')).toBeTruthy());
    expect(withdrawOffer).toHaveBeenCalledWith('o1');
  });

  it('invalidates offers-for-task and my-offers on success', async () => {
    (withdrawOffer as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<WithdrawOfferProbe />, client);
    fireEvent.press(screen.getByText('withdraw'));
    await waitFor(() => expect(screen.getByText('withdrawn')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'task', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'mine'] });
  });
});

describe('useAcceptOffer', () => {
  it('calls acceptOffer with the offer id', async () => {
    (acceptOffer as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<AcceptOfferProbe />);
    fireEvent.press(screen.getByText('accept'));
    await waitFor(() => expect(screen.getByText('accepted')).toBeTruthy());
    expect(acceptOffer).toHaveBeenCalledWith('o1');
  });

  it('invalidates offers-for-task, task detail, and task lists on success', async () => {
    (acceptOffer as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<AcceptOfferProbe />, client);
    fireEvent.press(screen.getByText('accept'));
    await waitFor(() => expect(screen.getByText('accepted')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'task', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] });
  });
});
