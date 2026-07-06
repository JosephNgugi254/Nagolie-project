# seed_staff.py
from app import create_app, db
from app.models import User, Staff
from datetime import date

app = create_app()

def seed_staff():
    with app.app_context():
        staff_data = [
            {
                'username': 'Director',
                'first_name': 'Shadrack',
                'last_name': 'Kesumet',
                'phone': '254721451707',
                'national_id': '33485408',
                'role': 'director',
                'department': 'Executive',
                'position': 'Director and Founder',
                'email': 'kesumetshadrack@gmail.com'
            },
            {
                'username': 'Ngugi',
                'first_name': 'Joseph',
                'last_name': 'Ngugi',
                'phone': '254797644034',
                'national_id': '38489214',
                'role': 'head_of_it',
                'department': 'ICT',
                'position': 'Technical Operations Manager',
                'email': 'solitaryjoe069@gmail.com'
            },
            {
                'username': 'valuer',
                'first_name': 'George',
                'last_name': 'Marite',
                'phone': '254703994290',
                'national_id': '34061030',
                'role': 'valuer',
                'department': 'Valuation & Recovery',
                'position': 'Senior Livestock Valuer & Recovery Officer',
                'email': 'georgemarite@gmail.com'
            },
            {
                'username': 'secretary',
                'first_name': 'Gladys',
                'last_name': 'Sakinoi',
                'phone': '254727635515',
                'national_id': '41599445',
                'role': 'secretary',
                'department': 'Administration',
                'position': 'Secretary',
                'email': 'sakinoigladys@gmail.com' 
            },
            {
                'username': 'Annie',
                'first_name': 'Ann',
                'last_name': 'Ndura',
                'phone': '254727320067',
                'national_id': '40742744',
                'role': 'client_relations_officer',
                'department': 'Client Relations',
                'position': 'Client Relations Officer',
                'email': 'ndurah67@gmail.com'
            },
            {
                'username': 'Lucie',
                'first_name': 'Lucy',
                'last_name': 'Nyambura',
                'phone': '254706411713',
                'national_id': '41390880',
                'role': 'client_relations_officer',
                'department': 'Client Relations',
                'position': 'Client Relations Officer',
                'email': 'lucienyambura19@gmail.com'
            },
            {
                'username': 'Robert',
                'first_name': 'Robert',
                'last_name': 'Kalama',
                'phone': '254711744388',
                'national_id': '40340890',   
                'role': 'valuer',
                'department': 'Valuation & Recovery',
                'position': 'Livestock Valuer & Recovery Officer(Emarti)',
                'email': 'robertkalama505@gmail.com'
            }
        ]

        for idx, data in enumerate(staff_data, start=1):
            # Find user by exact username
            user = User.query.filter_by(username=data['username']).first()
            if not user:
                print(f"❌ User '{data['username']}' not found – skipping")
                continue

            # Update only the new fields – username and password stay untouched
            user.first_name = data['first_name']
            user.last_name = data['last_name']
            user.phone = data['phone']
            if data.get('national_id'):
                user.national_id = data['national_id']
            # Update role if it changed
            if user.role != data['role']:
                user.role = data['role']
            # Update email if different (e.g., secretary)
            if user.email != data['email']:
                user.email = data['email']

            staff_number = f"NAG-EMP-{idx:04d}"

            staff = Staff.query.filter_by(user_id=user.id).first()
            if not staff:
                staff = Staff(
                    user_id=user.id,
                    staff_number=staff_number,
                    department=data['department'],
                    position=data['position'],
                    employment_status='Active',
                    date_joined=date.today()
                )
                db.session.add(staff)
                print(f"✅ Created staff {staff_number} for user '{user.username}'")
            else:
                staff.department = data['department']
                staff.position = data['position']
                print(f"✅ Updated staff {staff.staff_number} for user '{user.username}'")

        db.session.commit()
        print("🎉 Staff seeding completed – usernames unchanged.")

if __name__ == '__main__':
    seed_staff()