import { prisma } from '../config/database';

/**
 * Relationship-based access (Zanzibar-style) for firm -> advisor -> household.
 * Decisions are explained ("reason") and logged. The check is a pure function of stored
 * relationships so it can later be swapped for an OpenFGA server behind the same signature.
 *
 *   view   : household client; assigned advisor (view|manage); firm owner of the household's firm
 *   manage : assigned advisor with scope=manage; firm owner
 * An advisor assignment only counts while the advisor is still a member of the household's firm.
 */
export type HouseholdAction = 'view' | 'manage';
export interface Decision { allowed: boolean; reason: string }

export async function checkHousehold(userId: string, householdId: string, action: HouseholdAction): Promise<Decision> {
  const h = await prisma.household.findUnique({
    where: { id: householdId },
    include: { clients: { where: { userId } }, assignments: { where: { advisorUserId: userId } } },
  });
  let d: Decision;
  if (!h) {
    d = { allowed: false, reason: 'household not found' };
  } else {
    const member = await prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: h.firmId, userId } } });
    if (member?.role === 'owner') d = { allowed: true, reason: 'firm owner' };
    else if (member && h.assignments[0] && (action === 'view' || h.assignments[0].scope === 'manage'))
      d = { allowed: true, reason: `assigned advisor (${h.assignments[0].scope})` };
    else if (h.clients[0] && action === 'view') d = { allowed: true, reason: 'household client' };
    else d = { allowed: false, reason: 'no relationship grants this action' };
  }
  try {
    if (h) await prisma.accessLog.create({ data: { actorId: userId, householdId, action, allowed: d.allowed, reason: d.reason } });
  } catch { /* logging must not change the decision */ }
  return d;
}

export async function visibleHouseholdIds(userId: string): Promise<string[]> {
  const [owned, assigned, client] = await Promise.all([
    prisma.household.findMany({ where: { firm: { members: { some: { userId, role: 'owner' } } } }, select: { id: true } }),
    prisma.household.findMany({ where: { assignments: { some: { advisorUserId: userId } }, firm: { members: { some: { userId } } } }, select: { id: true } }),
    prisma.household.findMany({ where: { clients: { some: { userId } } }, select: { id: true } }),
  ]);
  return [...new Set([...owned, ...assigned, ...client].map(x => x.id))];
}
