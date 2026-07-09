import type { TaskStatus } from '@/features/tasks/types';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

// The raw shape of a row in public.offers.
export interface Offer {
  id: string;
  task_id: string;
  freelancer_id: string;
  price: number;
  message: string | null;
  status: OfferStatus;
  created_at: string;
}

export interface OfferFreelancer {
  full_name: string | null;
  avatar_url: string | null;
}

// What the task owner sees: an offer plus who made it.
export interface OfferWithFreelancer extends Offer {
  freelancer: OfferFreelancer;
}

// Minimal task info needed to render a row in "Trabajos". Nullable: RLS
// (tasks_select_visible) can hide the task from a freelancer whose offer was
// rejected once the task is assigned to someone else and no longer open —
// the offer itself stays visible (offers_select_related: freelancer_id =
// auth.uid()), but the joined task can come back null. See "Before you
// start" in the plan for the full trace.
export interface OfferTaskSummary {
  id: string;
  title: string;
  city: string;
  status: TaskStatus;
}

export interface MyOfferWithTask extends Offer {
  task: OfferTaskSummary | null;
}

export interface CreateOfferInput {
  task_id: string;
  price: number;
  message: string | null;
}
