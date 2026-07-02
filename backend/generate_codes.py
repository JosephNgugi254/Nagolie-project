# generate_codes.py
import qrcode
import barcode
from barcode.writer import ImageWriter
from app import create_app, db
from app.models import Staff
import os

app = create_app()
with app.app_context():
    os.makedirs('qr_codes', exist_ok=True)
    os.makedirs('barcodes', exist_ok=True)

    staff_list = Staff.query.all()
    for staff in staff_list:
        staff_number = staff.staff_number

        # QR Code – points to verification page
        qr_url = f"https://nagolie.com/staff/{staff_number}"  # change domain if needed
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill="black", back_color="white")
        img.save(f"qr_codes/{staff_number}.png")

        # Barcode (Code 128) – encodes staff number
        code128 = barcode.get_barcode_class('code128')
        code = code128(staff_number, writer=ImageWriter())
        code.save(f"barcodes/{staff_number}")

        print(f"Generated codes for {staff_number}")

print("✅ All codes generated.")