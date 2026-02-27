import cloudinary.uploader
import uuid

def upload_base64_image(base64_string, folder='livestock'):
    """
    Upload a base64 image to Cloudinary and return the secure URL.
    The folder parameter organises images (e.g., 'livestock', 'loan_applications').
    """
    try:
        # Remove data URL prefix if present (e.g., "data:image/png;base64,")
        if 'base64,' in base64_string:
            base64_string = base64_string.split('base64,')[1]

        # Generate a unique public_id to avoid collisions
        public_id = f"{folder}/{uuid.uuid4()}"

        # Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            f"data:image/png;base64,{base64_string}",
            public_id=public_id,
            folder=folder,
            resource_type="image"
        )

        return upload_result.get('secure_url')
    except Exception as e:
        print(f"Cloudinary upload error: {str(e)}")
        raise