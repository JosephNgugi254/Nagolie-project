# app/routes/company_gallery.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime
from decimal import Decimal
from app import db
from app.models import CompanyGalleryImage
from app.utils.cloudinary_upload import upload_base64_image, delete_image
from app.utils.security import admin_required
import traceback

company_gallery_bp = Blueprint('company_gallery', __name__)

# ---------- Public endpoint (no auth required) ----------
@company_gallery_bp.route('/public', methods=['GET'])
def get_public_gallery():
    """Return all company gallery images, optionally filtered by category."""
    try:
        category = request.args.get('category')
        query = CompanyGalleryImage.query
        if category and category != 'all':
            query = query.filter_by(category=category)
        images = query.order_by(CompanyGalleryImage.created_at.desc()).all()
        return jsonify([img.to_dict() for img in images]), 200
    except Exception as e:
        print(f"Error fetching company gallery: {str(e)}")
        return jsonify({'error': 'Failed to load gallery'}), 500


@company_gallery_bp.route('/admin', methods=['POST'])
@jwt_required()
@admin_required
def add_gallery_images():
    print("=== Starting image upload ===")
    try:
        data = request.json
        print(f"Received data: category={data.get('category')}, title={data.get('title')}, image count={len(data.get('images', []))}")
        
        category = data.get('category')
        title = data.get('title')
        description = data.get('description', '')
        images = data.get('images', [])

        if not category or not title or not images:
            return jsonify({'error': 'Category, title and at least one image are required'}), 400

        date_taken = None
        if data.get('date'):
            try:
                date_taken = datetime.strptime(data['date'], '%Y-%m-%d').date()
                print(f"Date taken: {date_taken}")
            except:
                pass

        created_images = []
        for idx, base64_image in enumerate(images):
            print(f"Processing image {idx+1}/{len(images)}")
            # Upload to Cloudinary
            result = upload_base64_image(base64_image, folder='company_gallery')
            print(f"Cloudinary result type: {type(result)}")

            if isinstance(result, str):
                image_url = result
                public_id = None
                print("Result is string (old format)")
            else:
                image_url = result['url']
                public_id = result['public_id']
                print(f"Image URL: {image_url}, public_id: {public_id}")

            new_img = CompanyGalleryImage(
                category=category,
                title=title,
                description=description,
                image_url=image_url,
                public_id=public_id,
                date_taken=date_taken
            )
            db.session.add(new_img)
            created_images.append(new_img)

        print("Committing to database...")
        db.session.commit()
        print("Commit successful")
        return jsonify({'success': True, 'message': f'{len(created_images)} image(s) uploaded', 'images': [img.to_dict() for img in created_images]}), 201

    except Exception as e:
        db.session.rollback()
        print(f"!!! ERROR: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@company_gallery_bp.route('/admin/<int:image_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_gallery_image(image_id):
    """Delete a single image from database and Cloudinary."""
    try:
        image = CompanyGalleryImage.query.get(image_id)
        if not image:
            return jsonify({'error': 'Image not found'}), 404

        # Delete from Cloudinary
        if image.public_id:
            delete_image(image.public_id)

        db.session.delete(image)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Image deleted'}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error deleting gallery image: {str(e)}")
        return jsonify({'error': str(e)}), 500


# Optional: update an image (title, description, category)
@company_gallery_bp.route('/admin/<int:image_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_gallery_image(image_id):
    """Update metadata of a single image."""
    try:
        image = CompanyGalleryImage.query.get(image_id)
        if not image:
            return jsonify({'error': 'Image not found'}), 404

        data = request.json
        if 'category' in data:
            image.category = data['category']
        if 'title' in data:
            image.title = data['title']
        if 'description' in data:
            image.description = data['description']
        if 'date' in data:
            try:
                image.date_taken = datetime.strptime(data['date'], '%Y-%m-%d').date()
            except:
                pass

        db.session.commit()
        return jsonify({'success': True, 'image': image.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating gallery image: {str(e)}")
        return jsonify({'error': str(e)}), 500