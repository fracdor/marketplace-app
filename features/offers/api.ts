import { supabase } from '@/lib/supabase';
import type { CreateOfferInput, MyOfferWithTask, Offer, OfferWithFreelancer } from '@/features/offers/types';

const OFFER_SELECT = 'id, task_id, freelancer_id, price, message, status, created_at';

// See features/tasks/api.ts's attachClients for why this is a second query
// rather than an embed: profiles_public is a view (no FK of its own), and
// embedding the underlying profiles table directly would apply
// profiles_select_own RLS (auth.uid() = id) per row.
async function attachFreelancers(offers: Offer[]): Promise<OfferWithFreelancer[]> {
  const freelancerIds = [...new Set(offers.map((o) => o.freelancer_id))];
  if (freelancerIds.length === 0) return [];

  const { data: freelancers, error } = await supabase
    .from('profiles_public')
    .select('id, full_name, avatar_url')
    .in('id', freelancerIds);
  if (error) throw error;

  const byId = new Map((freelancers ?? []).map((f) => [f.id, f]));
  return offers.map((o) => ({
    ...o,
    freelancer: byId.get(o.freelancer_id) ?? { full_name: null, avatar_url: null },
  }));
}

// offers_select_related RLS returns every offer on this task when the caller
// is the task's owner, or only the caller's own offer(s) otherwise — this
// function doesn't need to know which case it's in, RLS already scoped it.
export async function fetchOffersForTask(taskId: string): Promise<OfferWithFreelancer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select(OFFER_SELECT)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return attachFreelancers((data ?? []) as Offer[]);
}

// task:tasks(...) can legitimately come back null for a given row — see
// "Before you start" in the plan (MyOfferWithTask.task nullability).
export async function fetchMyOffers(freelancerId: string): Promise<MyOfferWithTask[]> {
  const { data, error } = await supabase
    .from('offers')
    .select(`${OFFER_SELECT}, task:tasks(id, title, city, status)`)
    .eq('freelancer_id', freelancerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MyOfferWithTask[];
}

// freelancer_id has no DB default — the caller supplies it, same reasoning
// as createTask's clientId parameter.
export async function createOffer(freelancerId: string, input: CreateOfferInput): Promise<void> {
  const { error } = await supabase.from('offers').insert({
    task_id: input.task_id,
    freelancer_id: freelancerId,
    price: input.price,
    message: input.message,
  });
  if (error) throw error;
}

export async function withdrawOffer(offerId: string): Promise<void> {
  const { error } = await supabase.from('offers').update({ status: 'withdrawn' }).eq('id', offerId);
  if (error) throw error;
}

export async function acceptOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
  if (error) throw error;
}
