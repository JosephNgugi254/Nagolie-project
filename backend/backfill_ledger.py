#!/usr/bin/env python
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import Loan, Transaction, LoanLedger
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
from app.routes.payments import recalculate_loan

def backfill_ledger():
    app = create_app()
    with app.app_context():
        # Process all loans ordered by disbursement date
        loans = Loan.query.order_by(Loan.disbursement_date).all()
        print(f"Found {len(loans)} loans to process.")

        for idx, loan in enumerate(loans, 1):
            # Skip if ledger already has entries (idempotent)
            if LoanLedger.query.filter_by(loan_id=loan.id).first():
                print(f"[{idx}/{len(loans)}] Loan {loan.id} already has ledger entries – skipping.")
                continue

            print(f"[{idx}/{len(loans)}] Processing loan {loan.id}...")

            # Get all transactions for this loan in order
            transactions = Transaction.query.filter_by(loan_id=loan.id).order_by(Transaction.created_at).all()

            # Start with disbursement state
            current_principal = loan.principal_amount
            accrued_interest = Decimal('0')
            interest_paid = Decimal('0')
            principal_paid = Decimal('0')
            amount_paid = Decimal('0')
            balance = loan.principal_amount
            repayment_plan = loan.repayment_plan
            interest_rate = loan.interest_rate
            disbursement_date = loan.disbursement_date or loan.created_at
            last_interest_date = disbursement_date
            # Special fields for weekly pre‑payment
            interest_prepaid_period = None
            interest_prepaid_amount = Decimal('0')

            def record_entry(event_type, transaction_obj, event_date, amount, notes=None, reference=None):
                # Compute current balances
                unpaid_interest = max(Decimal('0'), accrued_interest - interest_paid)
                total_out = current_principal + unpaid_interest
                entry = LoanLedger(
                    loan_id=loan.id,
                    transaction_id=transaction_obj.id if transaction_obj else None,
                    event_type=event_type,
                    event_date=event_date,
                    principal_balance=current_principal,
                    interest_balance=unpaid_interest,
                    penalty_balance=Decimal('0'),
                    total_outstanding=total_out,
                    amount=amount,
                    notes=notes,
                    reference=reference,
                    created_by=transaction_obj.created_by if transaction_obj else None,
                    created_at=event_date
                )
                db.session.add(entry)
                db.session.flush()

            # Record initial disbursement
            record_entry('disbursement', None, disbursement_date, loan.principal_amount,
                         notes='Initial disbursement', reference='BANK')

            # Helper to accrue interest up to a given date
            def accrue_up_to(date):
                nonlocal current_principal, accrued_interest, interest_paid, amount_paid, balance, last_interest_date
                if date <= last_interest_date:
                    return
                if interest_rate == 0:  # waived loan
                    return
                today = date.date() if hasattr(date, 'date') else date
                last = last_interest_date.date() if hasattr(last_interest_date, 'date') else last_interest_date
                if repayment_plan == 'daily':
                    days = (today - last).days
                    if days > 0:
                        daily_rate = Decimal('0.045')
                        for i in range(days):
                            day_interest = (current_principal * daily_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                            accrued_interest += day_interest
                            # Record accrual entry for this day
                            accrual_date = datetime.combine(last + timedelta(days=i+1), datetime.min.time())
                            record_entry('accrual', None, accrual_date, day_interest,
                                         notes=f'Daily interest at 4.5%', reference='AUTO')
                        last_interest_date += timedelta(days=days)
                else:  # weekly
                    weeks = (today - last).days // 7
                    if weeks > 0:
                        for w in range(weeks):
                            week_interest = (current_principal * Decimal('0.30')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                            # Check pre‑payment
                            disb_date = disbursement_date.date() if hasattr(disbursement_date, 'date') else disbursement_date
                            week_num = ((last - disb_date).days // 7) + w
                            period_key = f"{disb_date.isoformat()}-W{week_num}"
                            if interest_prepaid_period == period_key:
                                prepaid = interest_prepaid_amount
                                remaining = max(Decimal('0'), week_interest - prepaid)
                                current_principal += remaining
                                accrued_interest += week_interest
                                interest_prepaid_period = None
                                interest_prepaid_amount = Decimal('0')
                            else:
                                current_principal += week_interest
                                accrued_interest += week_interest
                            accrual_date = datetime.combine(last + timedelta(days=(w+1)*7), datetime.min.time())
                            record_entry('accrual', None, accrual_date, week_interest,
                                         notes=f'Weekly interest at 30%', reference='AUTO')
                        last_interest_date += timedelta(days=weeks * 7)
                unpaid = max(Decimal('0'), accrued_interest - interest_paid)
                balance = current_principal + unpaid

            # Process each transaction in order
            for txn in transactions:
                # Accrue interest up to txn.created_at
                accrue_up_to(txn.created_at)

                # Apply transaction
                if txn.transaction_type == 'payment':
                    ptype = txn.payment_type or 'principal'
                    amount = txn.amount
                    if ptype == 'interest':
                        # For weekly, interest payment reduces principal; for daily, reduces interest_paid
                        if repayment_plan == 'weekly':
                            current_principal -= amount
                            if current_principal < 0: current_principal = 0
                            interest_paid += amount
                            principal_paid += amount
                        else:
                            interest_paid += amount
                        amount_paid += amount
                    else:  # principal
                        current_principal -= amount
                        if current_principal < 0: current_principal = 0
                        principal_paid += amount
                        amount_paid += amount
                    # Recalculate balance after payment
                    unpaid = max(Decimal('0'), accrued_interest - interest_paid)
                    balance = current_principal + unpaid
                    record_entry('payment', txn, txn.created_at, amount,
                                 notes=txn.notes, reference=txn.mpesa_receipt or txn.payment_method)

                elif txn.transaction_type in ('topup', 'adjustment'):
                    amount = txn.amount
                    current_principal += amount
                    principal_paid += amount
                    balance = current_principal  # interest not affected immediately
                    record_entry('adjustment', txn, txn.created_at, amount,
                                 notes=txn.notes, reference=txn.mpesa_receipt or txn.payment_method)

                elif txn.transaction_type == 'renewal':
                    # Old loan becomes renewed, final balance recorded
                    # No further accrual needed; new loan will have separate entries
                    record_entry('renewal_merged', txn, txn.created_at, txn.amount,
                                 notes=f'Loan renewed into new loan', reference=str(txn.notes))
                    # Mark loan as cleared for further entries? We'll stop processing later transactions.
                    # But there shouldn't be any after renewal in this loan.
                    break

                elif txn.transaction_type == 'claim':
                    record_entry('claimed', txn, txn.created_at, 0,
                                 notes='Loan claimed – livestock repossessed', reference='CLAIM')
                    break

                else:
                    # Ignore other types (e.g., waiver handled separately)
                    pass

            # Final accrual up to today (optional, but good for completeness)
            accrue_up_to(datetime.utcnow())

            db.session.commit()
            print(f"  Done. Created {LoanLedger.query.filter_by(loan_id=loan.id).count()} ledger entries.")

        print("Backfill completed.")

if __name__ == '__main__':
    backfill_ledger()#!/usr/bin/env python
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import Loan, Transaction, LoanLedger
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta

def backfill_ledger():
    app = create_app()
    with app.app_context():
        loans = Loan.query.order_by(Loan.disbursement_date).all()
        print(f"Found {len(loans)} loans to process.")

        for idx, loan in enumerate(loans, 1):
            # Skip if loan already has ledger entries
            if LoanLedger.query.filter_by(loan_id=loan.id).first():
                print(f"[{idx}/{len(loans)}] Loan {loan.id} already has entries – skipping.")
                continue

            print(f"[{idx}/{len(loans)}] Processing loan {loan.id}...")

            # Get transactions in order
            transactions = Transaction.query.filter_by(loan_id=loan.id).order_by(Transaction.created_at).all()

            # Initial state
            current_principal = loan.principal_amount
            accrued_interest = Decimal('0')
            interest_paid = Decimal('0')
            principal_paid = Decimal('0')
            amount_paid = Decimal('0')
            balance = loan.principal_amount
            repayment_plan = loan.repayment_plan
            interest_rate = loan.interest_rate
            disbursement_date = loan.disbursement_date or loan.created_at
            last_interest_date = disbursement_date
            interest_prepaid_period = None
            interest_prepaid_amount = Decimal('0')

            def record_entry(event_type, transaction_obj, event_date, amount, notes=None, reference=None):
                unpaid_interest = max(Decimal('0'), accrued_interest - interest_paid)
                total_out = current_principal + unpaid_interest
                entry = LoanLedger(
                    loan_id=loan.id,
                    transaction_id=transaction_obj.id if transaction_obj else None,
                    event_type=event_type,
                    event_date=event_date,
                    principal_balance=current_principal,
                    interest_balance=unpaid_interest,
                    penalty_balance=Decimal('0'),
                    total_outstanding=total_out,
                    amount=amount,
                    notes=notes,
                    reference=reference,
                    created_by=transaction_obj.created_by if transaction_obj else None,
                    created_at=event_date
                )
                db.session.add(entry)
                db.session.flush()

            # Disbursement
            record_entry('disbursement', None, disbursement_date, loan.principal_amount,
                         notes='Initial disbursement', reference='BANK')

            def accrue_up_to(date):
                nonlocal current_principal, accrued_interest, interest_paid, amount_paid, balance, last_interest_date
                if date <= last_interest_date:
                    return
                if interest_rate == 0:
                    return
                today = date.date() if hasattr(date, 'date') else date
                last = last_interest_date.date() if hasattr(last_interest_date, 'date') else last_interest_date
                if repayment_plan == 'daily':
                    days = (today - last).days
                    if days > 0:
                        daily_rate = Decimal('0.045')
                        for i in range(days):
                            day_interest = (current_principal * daily_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                            accrued_interest += day_interest
                            accrual_date = datetime.combine(last + timedelta(days=i+1), datetime.min.time())
                            record_entry('accrual', None, accrual_date, day_interest,
                                         notes=f'Daily interest at 4.5%', reference='AUTO')
                        last_interest_date += timedelta(days=days)
                else:  # weekly
                    weeks = (today - last).days // 7
                    if weeks > 0:
                        disb_date = disbursement_date.date() if hasattr(disbursement_date, 'date') else disbursement_date
                        for w in range(weeks):
                            week_interest = (current_principal * Decimal('0.30')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                            week_num = ((last - disb_date).days // 7) + w
                            period_key = f"{disb_date.isoformat()}-W{week_num}"
                            if interest_prepaid_period == period_key:
                                prepaid = interest_prepaid_amount
                                remaining = max(Decimal('0'), week_interest - prepaid)
                                current_principal += remaining
                                accrued_interest += week_interest
                                interest_prepaid_period = None
                                interest_prepaid_amount = Decimal('0')
                            else:
                                current_principal += week_interest
                                accrued_interest += week_interest
                            accrual_date = datetime.combine(last + timedelta(days=(w+1)*7), datetime.min.time())
                            record_entry('accrual', None, accrual_date, week_interest,
                                         notes=f'Weekly interest at 30%', reference='AUTO')
                        last_interest_date += timedelta(days=weeks * 7)
                unpaid = max(Decimal('0'), accrued_interest - interest_paid)
                balance = current_principal + unpaid

            # Process each transaction
            for txn in transactions:
                accrue_up_to(txn.created_at)

                if txn.transaction_type == 'payment':
                    ptype = txn.payment_type or 'principal'
                    amount = txn.amount
                    if ptype == 'interest':
                        if repayment_plan == 'weekly':
                            current_principal -= amount
                            if current_principal < 0: current_principal = 0
                            interest_paid += amount
                            principal_paid += amount
                        else:  # daily
                            interest_paid += amount
                        amount_paid += amount
                    else:  # principal
                        current_principal -= amount
                        if current_principal < 0: current_principal = 0
                        principal_paid += amount
                        amount_paid += amount
                    unpaid = max(Decimal('0'), accrued_interest - interest_paid)
                    balance = current_principal + unpaid
                    record_entry('payment', txn, txn.created_at, amount,
                                 notes=txn.notes, reference=txn.mpesa_receipt or txn.payment_method)

                elif txn.transaction_type in ('topup', 'adjustment'):
                    amount = txn.amount
                    current_principal += amount
                    principal_paid += amount
                    balance = current_principal
                    record_entry('adjustment', txn, txn.created_at, amount,
                                 notes=txn.notes, reference=txn.mpesa_receipt or txn.payment_method)

                elif txn.transaction_type == 'renewal':
                    # Record final state of old loan before renewal
                    unpaid = max(Decimal('0'), accrued_interest - interest_paid)
                    total_balance = current_principal + unpaid
                    record_entry('renewal_merged', txn, txn.created_at, total_balance,
                                 notes=f'Loan renewed – transferred balance {total_balance}', reference=str(txn.notes))
                    # No further entries on this loan
                    break

                elif txn.transaction_type == 'claim':
                    record_entry('claimed', txn, txn.created_at, 0,
                                 notes='Loan claimed – livestock repossessed', reference='CLAIM')
                    break

                else:
                    # ignore other types (waiver handled separately)
                    pass

            # Final accrual up to now (optional)
            accrue_up_to(datetime.utcnow())

            db.session.commit()
            print(f"  Created {LoanLedger.query.filter_by(loan_id=loan.id).count()} ledger entries.")

        # After processing all loans, handle renewals for new loans
        # For each loan that is a renewal, add a separate renewal_created entry
        for loan in loans:
            if loan.parent_loan_id and not LoanLedger.query.filter_by(loan_id=loan.id, event_type='renewal_created').first():
                # This is a renewed loan – add initial entry with the transferred balance
                # But the transferred balance is the old loan's total_balance at renewal time.
                # We can infer it from the old loan's last entry before renewal.
                old_loan = Loan.query.get(loan.parent_loan_id)
                if old_loan:
                    last_entry = LoanLedger.query.filter_by(loan_id=old_loan.id, event_type='renewal_merged').order_by(LoanLedger.event_date.desc()).first()
                    if last_entry:
                        amount = last_entry.amount  # This is the transferred balance
                        record_entry('renewal_created', None, loan.disbursement_date or loan.created_at, amount,
                                     notes=f'Renewal of loan #{old_loan.id}', reference=str(old_loan.id))
                        db.session.commit()

        print("Backfill completed.")

if __name__ == '__main__':
    backfill_ledger()