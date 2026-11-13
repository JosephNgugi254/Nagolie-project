#!/usr/bin/env python
"""
diagnose_financial_report.py

Read-only diagnostic. Compares the Financial Report's outstanding book
against the Recovery module and Vickson (the flagged loan), and pinpoints
any unexplained principal difference.

Usage (from the backend project root):
    python diagnose_financial_report.py
"""
from decimal import Decimal, ROUND_HALF_UP

import app as app_module
from app import db
from app.models import Loan, FlaggedLoan
from app.routes.payments import recalculate_loan
from app.utils.interest_helpers import _get_current_period_key


# ----------------------------------------------------------------------
# Resolve the Flask app (supports both factory and module-level patterns)
# ----------------------------------------------------------------------
if hasattr(app_module, 'create_app'):
    flask_app = app_module.create_app()
elif hasattr(app_module, 'app'):
    flask_app = app_module.app
else:
    raise RuntimeError(
        "Cannot find Flask app — expected `create_app` or `app` in app/__init__.py"
    )


def _live_loan_state(loan):
    """Mirror of financial._live_loan_state — pure, no commit."""
    loan = recalculate_loan(loan, save=False)
    p = loan.current_principal or Decimal('0')

    if loan.repayment_plan == 'weekly' and (loan.interest_rate or 0) > 0:
        cp = _get_current_period_key(loan)
        raw = (p * Decimal('0.30')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        prepaid = (
            loan.interest_prepaid_amount
            if loan.interest_prepaid_period == cp
            else Decimal('0')
        ) or Decimal('0')
        i = max(Decimal('0'), raw - prepaid)
    else:
        i = max(
            Decimal('0'),
            (loan.accrued_interest or Decimal('0'))
            - (loan.interest_paid or Decimal('0')),
        )
    return p, i


def _hr(title):
    print()
    print("=" * 78)
    print(f"  {title}")
    print("=" * 78)


def main():
    with flask_app.app_context():
        _hr("FINANCIAL REPORT vs RECOVERY MODULE — RECONCILIATION DIAGNOSTIC")

        # ----------------------------------------------------------------
        # STEP 1 — Loan ID sets
        # ----------------------------------------------------------------
        flagged = FlaggedLoan.query.filter_by(resolved=False).all()
        flagged_ids = {f.loan_id for f in flagged}

        report_loans = Loan.query.filter(
            Loan.status.in_(['active', 'completed'])
        ).all()
        report_ids = {l.id for l in report_loans}

        recovery_loans = Loan.query.filter(Loan.status == 'active').all()
        recovery_ids = {l.id for l in recovery_loans if l.id not in flagged_ids}

        missing = report_ids - recovery_ids - flagged_ids

        print("\n---- STEP 1: Loan ID sets ----")
        print(f"  Report scope  (active + completed)     : {len(report_ids):>4} loans")
        print(f"  Recovery scope (active, not flagged)   : {len(recovery_ids):>4} loans")
        print(f"  Flagged (unresolved)                   : {len(flagged_ids):>4} loans")
        print(f"  In report but NOT in recovery+flagged  : {len(missing):>4} loans")

        if missing:
            print("\n  ⚠  UNEXPLAINED LOANS — investigate these:")
            for lid in sorted(missing):
                l = db.session.get(Loan, lid)
                if not l:
                    continue
                p, i = _live_loan_state(l) if l.status == 'active' else (
                    l.current_principal or Decimal('0'), Decimal('0')
                )
                print(
                    f"    Loan {lid:>5}  status={l.status:<10}  "
                    f"client={(l.client.full_name if l.client else '?'):<30}  "
                    f"principal={float(p):>16,.2f}  interest={float(i):>13,.2f}"
                )
        else:
            print("  ✓ Every active/completed loan is accounted for.")

        # ----------------------------------------------------------------
        # STEP 2 — Vickson (flagged loan) check
        # ----------------------------------------------------------------
        print("\n---- STEP 2: Flagged loan check ----")
        if not flagged_ids:
            print("  (no flagged loans — skipping)")
        else:
            for fid in sorted(flagged_ids):
                v = db.session.get(Loan, fid)
                if not v:
                    print(f"  Loan {fid} — MISSING FROM DB")
                    continue
                raw_p = v.current_principal or Decimal('0')
                p, i = _live_loan_state(v)
                print(f"  Loan ID                     : {v.id}")
                print(f"  Client                      : {v.client.full_name if v.client else '?'}")
                print(f"  Status                      : {v.status}")
                print(f"  Plan                        : {v.repayment_plan}")
                print(f"  current_principal (DB)      : {float(raw_p):>16,.2f}")
                print(f"  current_principal (computed): {float(p):>16,.2f}")
                print(f"  unpaid interest  (computed) : {float(i):>16,.2f}")
                print(f"  match?                      : {'YES' if abs(p - raw_p) < Decimal('0.01') else 'NO  ← DRIFT'}")
                print()

        # ----------------------------------------------------------------
        # STEP 3 — Per-loan recalculation drift  (THE key step)
        # ----------------------------------------------------------------
        print("---- STEP 3: Loans where recalculate_loan() changes current_principal ----")
        drift_loans = []
        drift_total = Decimal('0')
        for lid in recovery_ids | flagged_ids:
            l = db.session.get(Loan, lid)
            if not l or l.status != 'active':
                continue
            try:
                raw_p = l.current_principal or Decimal('0')
                p, i = _live_loan_state(l)
                diff = p - raw_p
                if abs(diff) > Decimal('0.01'):
                    drift_loans.append((lid, l, raw_p, p, diff))
                    drift_total += diff
            except Exception as e:
                print(f"  Loan {lid} — EXCEPTION in recalculate_loan: {e}")

        if drift_loans:
            print(f"  {len(drift_loans)} loan(s) drift when recomputed:\n")
            print(f"  {'loan':>6}  {'client':<28}  {'DB principal':>16}  {'computed':>16}  {'drift':>14}")
            print("  " + "-" * 88)
            for lid, l, raw_p, p, diff in drift_loans:
                name = (l.client.full_name if l.client else '?')[:28]
                print(
                    f"  {lid:>6}  {name:<28}  "
                    f"{float(raw_p):>16,.2f}  {float(p):>16,.2f}  {float(diff):>+14,.2f}"
                )
            print("  " + "-" * 88)
            print(f"  {'TOTAL DRIFT':<43}  {float(drift_total):>+48,.2f}")
        else:
            print("  ✓ No per-loan recalculation drift — in-memory value == DB value.")

        # ----------------------------------------------------------------
        # STEP 4 — Headline totals reconciliation
        # ----------------------------------------------------------------
        print("\n---- STEP 4: Totals reconciliation ----")

        def _sum_state(id_set):
            sp = si = Decimal('0')
            for lid in id_set:
                l = db.session.get(Loan, lid)
                if not l or l.status not in ('active', 'completed'):
                    continue
                p, i = _live_loan_state(l)
                sp += p
                si += i
            return sp, si

        rec_p, rec_i = _sum_state(recovery_ids)
        flg_p, flg_i = _sum_state(flagged_ids)
        rep_p, rep_i = _sum_state(report_ids)

        print(f"  Recovery principal         : {float(rec_p):>18,.2f}")
        print(f"  Flagged principal          : {float(flg_p):>18,.2f}")
        print(f"  Sum (recovery + flagged)   : {float(rec_p + flg_p):>18,.2f}")
        print(f"  Report principal           : {float(rep_p):>18,.2f}")
        gap = rep_p - (rec_p + flg_p)
        print(f"  UNACCOUNTED DIFFERENCE     : {float(gap):>18,.2f}   {'  ← the 419K lives here' if abs(gap) > Decimal('1') else '  ✓ perfect'}")
        print()
        print(f"  Recovery interest          : {float(rec_i):>18,.2f}")
        print(f"  Flagged interest           : {float(flg_i):>18,.2f}")
        print(f"  Report interest            : {float(rep_i):>18,.2f}")
        print(f"  Interest gap               : {float(rep_i - (rec_i + flg_i)):>18,.2f}")

        # ----------------------------------------------------------------
        # STEP 5 — Verdict
        # ----------------------------------------------------------------
        _hr("VERDICT")

        if not missing and not drift_loans and abs(gap) < Decimal('1'):
            print("  ✅ Report, Recovery, and flagged loans all reconcile.")
            print("     Nothing to fix — the current code is correct.")

        elif drift_loans and abs(drift_total - gap) < Decimal('1'):
            print(f"  ⚠  Root cause identified: recalculate_loan() drifts on {len(drift_loans)} loan(s)")
            print(f"     and the drift total ({float(drift_total):+,.2f}) equals the gap ({float(gap):+,.2f}).")
            print()
            print("     WHY: Recovery runs recalculate_loan(loan) with save=True (commits to DB),")
            print("     Report runs it with save=False (in-memory only). If the DB row's")
            print("     last_interest_payment_date / last_compounding_date is stale, the two")
            print("     calls produce different current_principal values.")
            print()
            print("     FIX: in get_loan_financial_report, after _live_loan_state(loan),")
            print("     commit the recalculated state so subsequent reads agree:")
            print()
            print("       p, i = _live_loan_state(loan)")
            print("       loan.current_principal = p")
            print("       loan.accrued_interest  = i + (loan.interest_paid or 0)")
            print()
            print("     …then db.session.commit() once after the loop.")

        elif missing:
            print(f"  ⚠  {len(missing)} loan(s) exist in the report but not in recovery/flagged.")
            print("     Inspect the list in STEP 1 — those loans are the entire gap.")

        elif abs(gap) > Decimal('1'):
            print(f"  ⚠  Unexplained {float(gap):+,.2f} gap.")
            print("     No missing loans, no per-loan drift detected on the current pass.")
            print("     Possible cause: an in-flight commit (Recovery saved mid-run) or")
            print("     a completed loan with a stale nonzero current_principal.")
            print()
            print("     Run:  python -c \"from app import app, db; from app.models import Loan;")
            print("            app.app_context().push();")
            print("            print([(l.id, l.client.full_name, float(l.current_principal))")
            print("                   for l in Loan.query.filter(Loan.status=='completed')")
            print("                   if (l.current_principal or 0) > 0.01])\"")

        else:
            print("  ✓ No structural difference — only flagged loans explain the gap.")

        print()
        print("=" * 78)


if __name__ == "__main__":
    main()