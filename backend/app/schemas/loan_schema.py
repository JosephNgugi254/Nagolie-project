from marshmallow import Schema, fields, validate

class LoanApplicationSchema(Schema):
    client_id = fields.Int(required=True)
    livestock_id = fields.Int()
    principal_amount = fields.Decimal(required=True, as_string=True)
    interest_rate = fields.Decimal(as_string=True)
    due_date = fields.DateTime(required=True)
    notes = fields.Str()

class ClientSchema(Schema):
    full_name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
    phone_number = fields.Str(required=True, validate=validate.Length(min=10, max=20))
    id_number = fields.Str(required=True, validate=validate.Length(min=5, max=20))
    email = fields.Email()
    location = fields.Str()

class LivestockSchema(Schema):
    client_id = fields.Int(required=True)
    livestock_type = fields.Str(required=True, validate=validate.OneOf(['cattle', 'goats', 'sheep', 'chickens', 'other']))
    count = fields.Int(required=True, validate=validate.Range(min=1))
    estimated_value = fields.Decimal(required=True, as_string=True)
    valuation_value = fields.Decimal(as_string=True)
    location = fields.Str()
    photos = fields.List(fields.Str())

# Add schema for public loan application
class PublicLoanApplicationSchema(Schema):
    full_name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
    phone_number = fields.Str(required=True, validate=validate.Length(min=10, max=20))
    id_number = fields.Str(required=True, validate=validate.Length(min=5, max=20))
    email = fields.Email()
    location = fields.Str()
    loan_amount = fields.Decimal(required=True, as_string=True)
    livestock_type = fields.Str(required=True, validate=validate.OneOf(['cattle', 'goats', 'sheep', 'chickens', 'other']))
    count = fields.Int(required=True, validate=validate.Range(min=1))
    estimated_value = fields.Decimal(as_string=True)
    notes = fields.Str()