/**
 * clientStatusBadge.js
 *
 * Shared helper that computes the correct status badge text and colour
 * for a loan row in both AdminPanel (Clients table) and RecoveryModule.
 *
 * Business rules:
 *   WEEKLY plan
 *     • due_date advances +7 days each week (handled by recalculate_loan)
 *     • days_left is therefore always in the range -∞ … 7
 *     • When positive  → "{n} day(s) left"   (green if ≥3, yellow if 1-2)
 *     • When 0         → "Due Today"          (yellow)
 *     • When negative  → "Overdue"            (red)
 *
 *   DAILY plan
 *     • due_date is fixed at disbursement + 14 days
 *     • days_left counts down from 14 to 0
 *     • Same badge logic as weekly but the starting value is 14
 *
 * @param {object} row   – client/loan object from the API
 * @returns {{ text: string, className: string }}
 */
export const getStatusBadge = (client) => {
  const isDaily = client.repayment_plan === 'daily';
  const daysOverdue = client.overdue_days || 0;
  const weeksOverdue = client.overdue_weeks || 0;
  const daysLeft = client.daysLeft ?? client.days_left ?? 0;

  // Overdue (after grace period)
  if ((isDaily && daysOverdue > 0) || (!isDaily && weeksOverdue > 0)) {
    if (isDaily) {
      return { text: `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`, className: 'badge bg-danger' };
    } else {
      return { text: `${weeksOverdue} week${weeksOverdue !== 1 ? 's' : ''} overdue`, className: 'badge bg-danger' };
    }
  }

  // Due today
  if (daysLeft === 0) {
    return { text: 'Due Today', className: 'badge bg-warning text-dark' };
  }

  // Still within repayment window (active, not overdue)
  if (daysLeft > 0) {
    const colorClass = daysLeft <= 2 ? 'bg-warning text-dark' : 'bg-success';
    return { text: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`, className: `badge ${colorClass}` };
  }

  // Completed or fully paid
  return { text: 'Completed', className: 'badge bg-secondary' };
};