import { render, screen, fireEvent } from '@testing-library/react-native';
import { TaskActionZone } from '@/components/tasks/TaskActionZone';
import type { TaskWithRelations } from '@/features/tasks/types';
import type { OfferWithFreelancer } from '@/features/offers/types';

const baseTask: TaskWithRelations = {
  id: 't1',
  client_id: 'owner-1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open',
  assigned_freelancer_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  category: { name: 'Plomería', slug: 'plomeria' },
  client: { full_name: 'Ana Ruiz', avatar_url: null },
};

function offer(overrides: Partial<OfferWithFreelancer>): OfferWithFreelancer {
  return {
    id: 'o1',
    task_id: 't1',
    freelancer_id: 'freelancer-1',
    price: 85000,
    message: null,
    status: 'pending',
    created_at: new Date().toISOString(),
    freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
    ...overrides,
  };
}

const noop = { onAccept: jest.fn(), onWithdraw: jest.fn(), onComplete: jest.fn(), onOffer: jest.fn() };
const flags = { accepting: false, withdrawing: false, completing: false };

describe('TaskActionZone', () => {
  it('Case A: owner, open, no offers', async () => {
    await render(<TaskActionZone task={baseTask} offers={[]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Aún no has recibido ofertas para esta tarea.')).toBeTruthy();
  });

  it('Case B: owner, open, with offers - lists them with an Aceptar button', async () => {
    await render(<TaskActionZone task={baseTask} offers={[offer({})]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Carlos Ruiz · $85.000')).toBeTruthy();
    expect(screen.getByText('Aceptar')).toBeTruthy();
  });

  it('Case B: pressing Aceptar calls onAccept with the offer id, freelancer name, and price', async () => {
    const onAccept = jest.fn();
    await render(
      <TaskActionZone task={baseTask} offers={[offer({})]} myId="owner-1" {...flags} {...noop} onAccept={onAccept} />,
    );
    await fireEvent.press(screen.getByText('Aceptar'));
    expect(onAccept).toHaveBeenCalledWith('o1', 'Carlos Ruiz', 85000);
  });

  it('Case C: owner, assigned - shows the winner and a Marcar como completada button', async () => {
    const task = { ...baseTask, status: 'assigned' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone task={task} offers={[offer({ status: 'accepted' })]} myId="owner-1" {...flags} {...noop} />,
    );
    expect(screen.getByText('Asignada a Carlos Ruiz')).toBeTruthy();
    expect(screen.getByText('Marcar como completada')).toBeTruthy();
  });

  it('Case C: pressing Marcar como completada calls onComplete', async () => {
    const task = { ...baseTask, status: 'assigned' as const, assigned_freelancer_id: 'freelancer-1' };
    const onComplete = jest.fn();
    await render(
      <TaskActionZone
        task={task}
        offers={[offer({ status: 'accepted' })]}
        myId="owner-1"
        {...flags}
        {...noop}
        onComplete={onComplete}
      />,
    );
    await fireEvent.press(screen.getByText('Marcar como completada'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Case D: owner, completed - shows the completed message with the winner name, no action', async () => {
    const task = { ...baseTask, status: 'completed' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone task={task} offers={[offer({ status: 'accepted' })]} myId="owner-1" {...flags} {...noop} />,
    );
    expect(screen.getByText('Tarea completada · Carlos Ruiz')).toBeTruthy();
    expect(screen.queryByText('Marcar como completada')).toBeNull();
  });

  it('Case E: assigned freelancer, assigned - shows an informative message, no action', async () => {
    const task = { ...baseTask, status: 'assigned' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone
        task={task}
        offers={[offer({ status: 'accepted' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Te asignaron esta tarea. Contacta al cliente para coordinar.')).toBeTruthy();
  });

  it('Case F: assigned freelancer, completed - shows a completed message', async () => {
    const task = { ...baseTask, status: 'completed' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone
        task={task}
        offers={[offer({ status: 'accepted' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Trabajo completado.')).toBeTruthy();
  });

  it('Case G: not owner, not assigned, open, no offer yet - shows an Ofertar button', async () => {
    await render(<TaskActionZone task={baseTask} offers={[]} myId="freelancer-1" {...flags} {...noop} />);
    expect(screen.getByText('Ofertar')).toBeTruthy();
  });

  it('Case G: pressing Ofertar calls onOffer', async () => {
    const onOffer = jest.fn();
    await render(
      <TaskActionZone task={baseTask} offers={[]} myId="freelancer-1" {...flags} {...noop} onOffer={onOffer} />,
    );
    await fireEvent.press(screen.getByText('Ofertar'));
    expect(onOffer).toHaveBeenCalledTimes(1);
  });

  it('Case H: not owner, my offer is pending - shows the price and a Retirar oferta button', async () => {
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'pending' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Ya ofertaste $85.000 · Pendiente')).toBeTruthy();
    expect(screen.getByText('Retirar oferta')).toBeTruthy();
  });

  it('Case H: pressing Retirar oferta calls onWithdraw with the offer id', async () => {
    const onWithdraw = jest.fn();
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'pending' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
        onWithdraw={onWithdraw}
      />,
    );
    await fireEvent.press(screen.getByText('Retirar oferta'));
    expect(onWithdraw).toHaveBeenCalledWith('o1');
  });

  it('Case I: not owner, my offer was withdrawn - shows a blocked message, no button', async () => {
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'withdrawn' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Ya no puedes ofertar en esta tarea.')).toBeTruthy();
    expect(screen.queryByText('Retirar oferta')).toBeNull();
  });

  it('Case I: not owner, my offer was rejected - shows the same blocked message', async () => {
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'rejected' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Ya no puedes ofertar en esta tarea.')).toBeTruthy();
  });

  it('Case J: owner, cancelled - shows a cancelled message', async () => {
    const task = { ...baseTask, status: 'cancelled' as const };
    await render(<TaskActionZone task={task} offers={[]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Tarea cancelada.')).toBeTruthy();
  });
});
