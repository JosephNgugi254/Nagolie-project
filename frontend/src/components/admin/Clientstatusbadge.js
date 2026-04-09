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
export function getStatusBadge(row) {
  const principal = Number(row.currentPrincipal ?? row.current_principal ?? row.borrowedAmount ?? 0);
  const balance   = Number(row.balance ?? 0);
  const days      = row.daysLeft ?? row.days_left ?? 0;
  const plan      = row.repayment_plan ?? 'weekly';

  // Fully paid
  if (principal <= 0.01 && balance <= 0.01) {
    return { text: 'Completed', className: 'badge bg-secondary' };
  }

  // Due today
  if (days === 0) {
    return { text: 'Due Today', className: 'badge bg-warning text-dark' };
  }

  // Overdue (past due date)
  if (days < 0) {
    const weeksOver = Math.ceil(Math.abs(days) / 7);
    return {
      text: `Overdue ${weeksOver}w`,
      className: 'badge bg-danger'
    };
  }

  // Still within repayment window
  const colorClass = days <= 2 ? 'bg-warning text-dark' : 'bg-success';
  const label = plan === 'daily'
    ? `${days} day${days !== 1 ? 's' : ''} left`   // daily: shows 1-14
    : `${days} day${days !== 1 ? 's' : ''} left`;   // weekly: shows 1-7

  return { text: label, className: `badge ${colorClass}` };
}

/**
 * getDaysLeftBadge  (React JSX version for RecoveryModule)
 * Returns a <span> element or null.
 */
export function getDaysLeftBadge(loan) {
  const days = loan.days_left ?? null;
  if (days === null || days === undefined) return null;

  if (days <= 0) {
    const overText = days < 0 ? `Overdue ${Math.ceil(Math.abs(days) / 7)}w` : 'Due Today';
    return { text: overText, cls: days < 0 ? 'bg-danger' : 'bg-warning text-dark' };
  }
  if (days <= 2) return { text: `${days}d left`, cls: 'bg-warning text-dark' };
  return { text: `${days}d left`, cls: 'bg-success' };
}