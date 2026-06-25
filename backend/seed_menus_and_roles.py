#!/usr/bin/env python
"""
Run this script inside the backend folder with:
    python seed_menus_and_roles.py
It will create all menu items, roles, and assign menu items to roles.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import MenuItem, Role, RoleMenuItem
from datetime import datetime

app = create_app()

def seed():
    with app.app_context():
        # 1. Define all possible menu items (both admin and recovery)
        menu_items_data = [
            # Admin menu
            {'key': 'overview', 'label': 'Overview', 'icon': 'fa-tachometer-alt', 'path': '/admin', 'order': 10},
            {'key': 'clients', 'label': 'Clients', 'icon': 'fa-users', 'path': '/admin/clients', 'order': 20},
            {'key': 'transactions', 'label': 'Transactions', 'icon': 'fa-exchange-alt', 'path': '/admin/transactions', 'order': 30},
            {'key': 'payment-stats', 'label': 'Payment Stats', 'icon': 'fa-chart-bar', 'path': '/admin/payment-stats', 'order': 40},
            {'key': 'gallery', 'label': 'Livestock Gallery', 'icon': 'fa-images', 'path': '/admin/gallery', 'order': 50},
            {'key': 'company-gallery', 'label': 'Company Gallery', 'icon': 'fa-images', 'path': '/admin/company-gallery', 'order': 55},
            {'key': 'applications', 'label': 'Applications', 'icon': 'fa-file-alt', 'path': '/admin/applications', 'order': 60},
            {'key': 'report-management', 'label': 'Report Management', 'icon': 'fa-chart-line', 'path': '/admin/report-management', 'order': 70},
            {'key': 'utilities', 'label': 'Utilities', 'icon': 'fa-tools', 'path': '/admin/utilities', 'order': 80},
            {'key': 'investors', 'label': 'Investors', 'icon': 'fa-users', 'path': '/admin/investors', 'order': 90},
            {'key': 'settings', 'label': 'Settings', 'icon': 'fa-cog', 'path': '/admin/settings', 'order': 100},
            {'key': 'user-management', 'label': 'User Management', 'icon': 'fa-users-cog', 'path': '/admin/user-management', 'order': 85},

            # Recovery menu (some keys may overlap, but we keep separate for clarity)
            {'key': 'recovery', 'label': 'Recovery Module', 'icon': 'fa-chart-line', 'path': '/recovery', 'order': 10},
            {'key': 'inbox', 'label': 'Inbox', 'icon': 'fa-envelope', 'path': '/recovery/inbox', 'order': 20},
            {'key': 'applications', 'label': 'Applications', 'icon': 'fa-file-alt', 'path': '/recovery/applications', 'order': 30},
            {'key': 'payment-stats', 'label': 'Payment Stats', 'icon': 'fa-chart-bar', 'path': '/recovery/payment-stats', 'order': 40},
            {'key': 'transactions', 'label': 'Transactions', 'icon': 'fa-exchange-alt', 'path': '/recovery/transactions', 'order': 50},
            {'key': 'gallery', 'label': 'Livestock Gallery', 'icon': 'fa-images', 'path': '/recovery/gallery', 'order': 60},
            {'key': 'report-management', 'label': 'Report Management', 'icon': 'fa-chart-pie', 'path': '/recovery/report-management', 'order': 70},
            {'key': 'utilities', 'label': 'Utilities', 'icon': 'fa-tools', 'path': '/recovery/utilities', 'order': 80},
            {'key': 'settings', 'label': 'Settings', 'icon': 'fa-cog', 'path': '/recovery/settings', 'order': 90},
            {'key': 'reports', 'label': 'Reports', 'icon': 'fa-chart-pie', 'path': '/recovery/reports', 'order': 100},
            {'key': 'investor-section', 'label': 'Investor Section', 'icon': 'fa-lock', 'path': '/recovery/investors', 'order': 110},
            {'key': 'loan-reports', 'label': 'Loan Reports', 'icon': 'fa-file-alt', 'path': '/loan-reports', 'order': 75},
            {'key': 'salaries', 'label': 'Salaries', 'icon': 'fa-wallet', 'path': '/admin/salaries', 'order': 95},
            {'key': 'financial-reports', 'label': 'Financial Reports', 'icon': 'fa-chart-pie', 'path': '/admin/financial-reports', 'order': 75},
            {'key': 'petty-cash', 'label': 'Petty Cash', 'icon': 'fa-wallet', 'path': '/recovery/petty-cash', 'order': 35},
        ]

        for item in menu_items_data:
            existing = MenuItem.query.filter_by(key=item['key']).first()
            if not existing:
                db.session.add(MenuItem(**item))
        db.session.commit()
        print("✅ Menu items created/updated.")

        # 2. Define roles and their allowed menu keys (using the menu keys defined above)
        #    For simplicity, we reuse the same keys. HR manager will be created later via API.
        roles_data = {
            'admin': ['overview', 'clients', 'transactions', 'payment-stats', 'gallery',
                      'company-gallery', 'applications', 'report-management','loan-reports', 'financial-reports', 'utilities',
                      'investors','user-management', 'settings'],
            'director': ['overview', 'recovery', 'inbox', 'applications', 'payment-stats',
                         'transactions', 'gallery', 'investors', 'report-management','loan-reports',
                         'financial-reports', 'petty-cash','salaries' , 'utilities', 'settings'],
            'secretary': ['overview', 'recovery', 'inbox', 'applications', 'payment-stats',
                          'transactions', 'reports','petty-cash', 'utilities', 'settings'],
            'client_relations_officer': ['overview', 'recovery', 'inbox', 'applications',
                             'payment-stats', 'transactions', 'reports', 'utilities', 'settings'],
            'accountant': ['recovery', 'reports', 'inbox', 'utilities', 'settings'],
            'valuer': ['recovery', 'reports', 'inbox','utilities', 'settings'],
            'head_of_it': ['recovery', 'inbox','loan-reports', 'financial-reports', 'settings', 'utilities'],
            'deputy_director': ['recovery', 'reports', 'inbox', 'settings', 'utilities'],
            'hr_manager': ['overview', 'recovery', 'inbox', 'applications', 'payment-stats',
                   'transactions', 'gallery', 'report-management','loan-reports','salaries', 'utilities', 'settings'],
        }

        for role_name, menu_keys in roles_data.items():
            role = Role.query.filter_by(name=role_name).first()
            if not role:
                role = Role(name=role_name, description=f'{role_name} role')
                db.session.add(role)
                db.session.flush()

            # Clear existing assignments for this role (to avoid duplicates)
            RoleMenuItem.query.filter_by(role_id=role.id).delete()

            for key in menu_keys:
                menu_item = MenuItem.query.filter_by(key=key).first()
                if menu_item:
                    db.session.add(RoleMenuItem(role_id=role.id, menu_item_id=menu_item.id))
                else:
                    print(f"⚠️ Warning: Menu key '{key}' not found for role '{role_name}'")
        db.session.commit()
        print("✅ Roles and permissions seeded successfully.")

if __name__ == '__main__':
    seed()