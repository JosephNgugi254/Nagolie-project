#!/usr/bin/env python
"""
fix_stale_loan_state.py

One-off repair. Brings every active loan's DB row in sync with what
recalculate_loan() produces, so all pages agree (Payment Stats, Approved
Loans, Recovery, Financial Report, receipts, PDFs).

Run ONCE after deploying:
  • financial.py — get_loan_financial_report / get_financial_dashboard_summary
  • recovery.py  — get_recovery_data (now commits)

Re-run is safe — recalculate_loan() is idempotent for up-to-date loans.

Usage (from backend project root):
    python fix_stale_loan_state.py
"""
import app as app_module
from app import db
from app.models import Loan
from app.routes.payments import recalculate_loan


# ----------------------------------------------------------------------
# Resolve Flask app (supports factory and module-level patterns)
# ----------------------------------------------------------------------
if hasattr(app_module, 'create_app'):
    flask_app = app_module.create_app()
elif hasattr(app_module, 'app'):
    flask_app = app_module.app
else:
    raise RuntimeError(
        "Cannot find Flask app — expected `create_app` or `app` in app/__init__.py"
    )


def main():
    with flask_app.app_context():
        loans = Loan.query.filter(Loan.status == 'active').all()
        print(f"Active loans to check: {len(loans)}\n")

        updated = 0
        completed = 0
        total_principal_delta = 0.0
        total_interest_delta = 0.0

        # Print header
        print(f"  {'loan':>6}  {'client':<30}  "
              f"{'principal old→new':>36}  {'interest old→new':>28}")
        print("  " + "-" * 106)

        for loan in loans:
            # Snapshot DB values BEFORE recalc
            old_p = float(loan.current_principal or 0)
            old_i = float(loan.accrued_interest or 0)
            old_status = loan.status

            # Recompute in memory (save=True is a no-op in this function —
            # the mutations are only persisted by the commit at the end)
            loan = recalculate_loan(loan, save=True)

            new_p = float(loan.current_principal or 0)
            new_i = float(loan.accrued_interest or 0)

            p_changed = abs(new_p - old_p) > 0.01
            i_changed = abs(new_i - old_i) > 0.01
            status_changed = loan.status != old_status

            if p_changed or i_changed or status_changed:
                updated += 1
                total_principal_delta += (new_p - old_p)
                total_interest_delta  += (new_i - old_i)

                client_name = (loan.client.full_name if loan.client else '?')[:30]
                marker = ''
                if status_changed and loan.status == 'completed':
                    completed += 1
                    marker = '  ← completed'
                elif status_changed:
                    marker = f'  ← {old_status}→{loan.status}'

                print(
                    f"  {loan.id:>6}  {client_name:<30}  "
                    f"{old_p:>15,.2f} → {new_p:>15,.2f}  "
                    f"{old_i:>12,.2f} → {new_i:>12,.2f}"
                    f"{marker}"
                )

        db.session.commit()

        print("  " + "-" * 106)
        print()
        print(f"Updated          : {updated} loan(s)")
        print(f"Newly completed  : {completed} loan(s)")
        print(f"Net principal Δ  : {total_principal_delta:+,.2f}")
        print(f"Net interest Δ   : {total_interest_delta:+,.2f}")
        print()
        print("✓ DB is now in sync with every UI. Re-running this script")
        print("  should print 'Updated: 0 loan(s)' on a second pass.")


if __name__ == "__main__":
    main()