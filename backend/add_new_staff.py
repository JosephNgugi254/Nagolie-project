from app import create_app, db
from app.models import User, Staff
from datetime import date
from werkzeug.security import generate_password_hash
import qrcode
import barcode
from barcode.writer import ImageWriter
import os

app = create_app()

def get_next_staff_number():
    """Return the next available staff number in the format NAG-EMP-XXXX."""
    with app.app_context():
        # Get the staff with the highest number
        last_staff = Staff.query.order_by(Staff.staff_number.desc()).first()
        if last_staff:
            # Extract numeric part (e.g., 'NAG-EMP-0007' -> 7)
            last_num = int(last_staff.staff_number.split('-')[-1])
            next_num = last_num + 1
        else:
            next_num = 1
        return f"NAG-EMP-{next_num:04d}"

def generate_codes_for_staff(staff_number):
    """Generate QR and barcode for a single staff member."""
    os.makedirs('qr_codes', exist_ok=True)
    os.makedirs('barcodes', exist_ok=True)

    # QR Code
    qr_url = f"https://nagolie.com/staff/{staff_number}"  # change domain if needed
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_url)
    qr.make(fit=True)
    img = qr.make_image(fill="black", back_color="white")
    img.save(f"qr_codes/{staff_number}.png")

    # Barcode (Code 128)
    code128 = barcode.get_barcode_class('code128')
    code = code128(staff_number, writer=ImageWriter())
    code.save(f"barcodes/{staff_number}")

    print(f"✅ Generated codes for {staff_number}")

def add_staff_member(data):
    """Create or update a User and create a Staff record."""
    username = data['username']
    email = data['email']
    phone = data['phone']
    national_id = data['national_id']
    first_name = data['first_name']
    last_name = data['last_name']
    role = data['role']
    department = data['department']
    position = data['position']

    with app.app_context():
        # 1. Check if user exists
        user = User.query.filter_by(username=username).first()
        if not user:
            # Create user with a default password – you may want to change this
            # or prompt for a password interactively.
            default_password = 'password123'  # CHANGE THIS!
            hashed_pw = generate_password_hash(default_password, method='pbkdf2:sha256')
            user = User(
                username=username,
                email=email,
                phone=phone,
                national_id=national_id,
                first_name=first_name,
                last_name=last_name,
                role=role,
                password_hash=hashed_pw
            )
            db.session.add(user)
            db.session.flush()  # get user.id
            print(f"✅ Created user '{username}' with ID {user.id}")
        else:
            # Optionally update user fields if they differ
            user.email = email
            user.phone = phone
            user.national_id = national_id
            user.first_name = first_name
            user.last_name = last_name
            user.role = role
            print(f"ℹ️ Updated existing user '{username}'")

        # 2. Check if staff record exists for this user
        staff = Staff.query.filter_by(user_id=user.id).first()
        if staff:
            print(f"⚠️ Staff record already exists for user '{username}' – updating fields")
            staff.department = department
            staff.position = position
            staff.employment_status = 'Active'
            # We do NOT change staff_number
        else:
            # Assign new staff number
            staff_number = get_next_staff_number()
            staff = Staff(
                user_id=user.id,
                staff_number=staff_number,
                department=department,
                position=position,
                employment_status='Active',
                date_joined=date.today()
            )
            db.session.add(staff)
            print(f"✅ Created staff {staff_number} for '{username}'")

        db.session.commit()

        # 3. Generate QR and barcode for this staff (only if new or you want to regenerate)
        # We'll generate only if this is a new staff record (not update).
        # But if you always want fresh codes, you can uncomment the line below.
        # generate_codes_for_staff(staff.staff_number)

        return staff.staff_number

if __name__ == '__main__':
    # Define the new staff members
    new_staff = [
        {
            'username': 'Terry',
            'first_name': 'Terry',
            'last_name': 'Kintei',
            'phone': '+254717167762',
            'national_id': '39490625',
            'email': 'terrykintei02@gmail.com',
            'role': 'hr_manager',
            'department': 'Human Resource',
            'position': 'Human Resource Manager'
        },
        {
            'username': 'Joshua',
            'first_name': 'Joshua',
            'last_name': 'Partapipi',
            'phone': '+254721664500',
            'national_id': '20519395',
            'email': 'joshua@nagolieenteprisesltd@gmail.com',
            'role': 'vetinary_officer',   
            'department': 'Livestock Production',
            'position': 'Livestock Production Officer'
        }
    ]

    with app.app_context():
        for staff_data in new_staff:
            add_staff_member(staff_data)

        # After adding all, generate codes for all (or only new ones).
        # The simplest is to generate codes for all staff – existing codes will be overwritten
        # but with the same content (staff number unchanged), so it's safe.
        # If you want to generate only for new ones, you can call generate_codes_for_staff inside the loop.
        print("\nGenerating QR codes and barcodes for ALL staff (existing ones will be overwritten with same content)...")
        all_staff = Staff.query.all()
        for staff in all_staff:
            generate_codes_for_staff(staff.staff_number)

        print("\n🎉 All new staff added and codes generated successfully.")