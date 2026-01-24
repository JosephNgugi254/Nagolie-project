from marshmallow import Schema, fields, validate, ValidationError, validates

class UserRegistrationSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=80))
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=6))
    role = fields.Str(validate=validate.OneOf(['admin', 'staff']))

class UserLoginSchema(Schema):
    username = fields.Str(required=True)
    password = fields.Str(required=True)


class ChangePasswordSchema(Schema):
    current_password = fields.Str(required=True)
    new_password = fields.Str(required=True, validate=lambda x: len(x) >= 6)
    confirm_password = fields.Str(required=True)
    
    @validates('confirm_password')
    def validate_password_match(self, value, **kwargs):
        if 'new_password' in self.context and value != self.context['new_password']:
            raise ValidationError('Passwords do not match')

class ChangeUsernameSchema(Schema):
    new_username = fields.Str(required=True, validate=lambda x: 3 <= len(x) <= 20)
    current_password = fields.Str(required=True)