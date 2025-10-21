from app import create_app, db
from app.models import Client, Loan, Livestock, Transaction
from datetime import datetime, timedelta
from decimal import Decimal

app = create_app()

with app.app_context():
    try:
        print("Adding test clients with Africa's Talking compatible phone numbers...")
        
        # Use Africa's Talking test numbers format
        phone1 = "254768805337"  # Test number format
        phone2 = "254711082002"  # Test number format
        
        print(f"Using phones: {phone1}, {phone2}")
        
        # Check if clients already exist by phone
        # Check if clients already exist by phone or id_number
        existing_client1 = Client.query.filter(
            (Client.phone_number == phone1) | (Client.id_number == "38489214")
        ).first()
        existing_client2 = Client.query.filter(
            (Client.phone_number == phone2) | (Client.id_number == "38489215")
        ).first()
        
        if existing_client1:
            print(f"Client with phone {phone1} or id_number 38489214 already exists, updating...")
            client1 = existing_client1
        else:
            # Test Client 1: Due Today
            client1 = Client(
                full_name="Joseph Ngugi",
                phone_number=phone1,
                id_number="38489214",
                email="joseph@test.com",
                location="Isinya"
            )
            db.session.add(client1)
            print("Created new client: Joseph Ngugi")
        
        db.session.flush()
        # Create livestock for client 1
        livestock1 = Livestock(
            client_id=client1.id,
            livestock_type="cattle",
            count=2,
            estimated_value=Decimal('50000'),
            location="Isinya",
            status='active'
        )
        db.session.add(livestock1)
        db.session.flush()
        
        # Check if loan already exists for client 1
        existing_loan1 = Loan.query.filter_by(client_id=client1.id, status='active').first()
        if existing_loan1:
            print(f"Active loan already exists for {client1.full_name}, updating due date...")
            existing_loan1.due_date = datetime.now().date()  # Set to due today
            existing_loan1.balance = Decimal('39000')
            loan1 = existing_loan1
        else:
            # Loan due today
            loan1 = Loan(
                client_id=client1.id,
                livestock_id=livestock1.id,
                principal_amount=Decimal('30000'),
                interest_rate=Decimal('30.0'),
                total_amount=Decimal('39000'),
                balance=Decimal('39000'),
                amount_paid=Decimal('0'),
                due_date=datetime.now().date(),  # Due today
                disbursement_date=datetime.now() - timedelta(days=1),
                status='active'
            )
            db.session.add(loan1)
            print("Created new loan due today")
        if existing_client2:
            print(f"Client with phone {phone2} or id_number 38489215 already exists, updating...")
            client2 = existing_client2
        else:
            # Test Client 2: Overdue
            client2 = Client(
                full_name="Mary Overdue",
                phone_number=phone2,
                id_number="38489215",
                email="mary_overdue@test.com",
                location="Isinya"
            )
            db.session.add(client2)
            print("Created new client: Mary Overdue")
        
        db.session.flush()
        
        # Create livestock for client 2
        livestock2 = Livestock(
            client_id=client2.id,
            livestock_type="goats",
            count=5,
            estimated_value=Decimal('25000'),
            location="Isinya",
            status='active'
        )
        db.session.add(livestock2)
        db.session.flush()
        
        # Check if loan already exists for client 2
        existing_loan2 = Loan.query.filter_by(client_id=client2.id, status='active').first()
        if existing_loan2:
            print(f"Active loan already exists for {client2.full_name}, updating to overdue...")
            existing_loan2.due_date = datetime.now().date() - timedelta(days=3)  # Set to overdue
            existing_loan2.balance = Decimal('19500')
            loan2 = existing_loan2
        else:
            # Overdue loan (due 3 days ago)
            loan2 = Loan(
                client_id=client2.id,
                livestock_id=livestock2.id,
                principal_amount=Decimal('15000'),
                interest_rate=Decimal('30.0'),
                total_amount=Decimal('19500'),
                balance=Decimal('19500'),
                amount_paid=Decimal('0'),
                due_date=datetime.now().date() - timedelta(days=3),  # Overdue
                disbursement_date=datetime.now() - timedelta(days=10),
                status='active'
            )
            db.session.add(loan2)
            print("Created new overdue loan")
        
        db.session.flush()
        
        # Add disbursement transactions only if they don't exist
        existing_txn1 = Transaction.query.filter_by(loan_id=loan1.id, transaction_type='disbursement').first()
        if not existing_txn1:
            transaction1 = Transaction(
                loan_id=loan1.id,
                transaction_type='disbursement',
                amount=Decimal('30000'),
                payment_method='cash',
                notes='Test loan disbursement - Due Today'
            )
            db.session.add(transaction1)
            print("Added disbursement transaction for due today loan")
        
        existing_txn2 = Transaction.query.filter_by(loan_id=loan2.id, transaction_type='disbursement').first()
        if not existing_txn2:
            transaction2 = Transaction(
                loan_id=loan2.id,
                transaction_type='disbursement',
                amount=Decimal('15000'),
                payment_method='cash',
                notes='Test loan disbursement - Overdue'
            )
            db.session.add(transaction2)
            print("Added disbursement transaction for overdue loan")
        
        db.session.commit()
        print("✅ Test clients setup completed successfully!")
        print(f"   - Due Today: {client1.full_name} (Phone: {client1.phone_number})")
        print(f"   - Overdue: {client2.full_name} (Phone: {client2.phone_number})")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()