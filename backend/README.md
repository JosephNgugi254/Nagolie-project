# Nagolie Backend API

Flask REST API for livestock-backed lending platform with M-Pesa integration.

## Quick Start

### Local Development

1. **Setup environment**
\`\`\`bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
\`\`\`

2. **Configure database**
\`\`\`bash
cp .env
# Edit .env with your PostgreSQL credentials
\`\`\`

3. **Run migrations**
\`\`\`bash
flask db upgrade
flask seed-admin
\`\`\`

4. **Start server**
\`\`\`bash
flask run
\`\`\`

### Docker Development

\`\`\`bash
docker-compose up -d
docker-compose exec backend flask db upgrade
docker-compose exec backend flask seed-admin
\`\`\`

## API Documentation

### Authentication Endpoints

#### POST /api/auth/login
Login user and get JWT token.

**Request:**
\`\`\`json
{
  "username": "admin",
  "password": "admin123"
}
\`\`\`

**Response:**
\`\`\`json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@nagolie.com",
    "role": "admin"
  }
}
\`\`\`

#### POST /api/auth/register
Register new user (admin only).

**Headers:**
\`\`\`
Authorization: Bearer <token>
\`\`\`

**Request:**
\`\`\`json
{
  "username": "staff1",
  "email": "staff@nagolie.com",
  "password": "password123",
  "role": "staff"
}
\`\`\`

### Client Endpoints

#### GET /api/clients
Get all clients.

**Response:**
\`\`\`json
[
  {
    "id": 1,
    "full_name": "John Doe",
    "phone_number": "254712345678",
    "id_number": "12345678",
    "email": "john@example.com",
    "location": "Isinya, Kajiado",
    "created_at": "2025-01-01T10:00:00"
  }
]
\`\`\`

#### POST /api/clients
Create new client.

**Request:**
\`\`\`json
{
  "full_name": "Jane Smith",
  "phone_number": "254723456789",
  "id_number": "23456789",
  "email": "jane@example.com",
  "location": "Isinya, Kajiado"
}
\`\`\`

### Loan Endpoints

#### POST /api/loans
Create new loan.

**Request:**
\`\`\`json
{
  "client_id": 1,
  "principal_amount": 50000,
  "interest_rate": 10,
  "due_date": "2025-02-01T00:00:00",
  "notes": "Emergency loan for medical expenses"
}
\`\`\`

**Response:**
\`\`\`json
{
  "id": 1,
  "client_id": 1,
  "client_name": "John Doe",
  "principal_amount": 50000,
  "interest_rate": 10,
  "total_amount": 55000,
  "amount_paid": 0,
  "balance": 55000,
  "disbursement_date": "2025-01-15T10:00:00",
  "due_date": "2025-02-01T00:00:00",
  "status": "active"
}
\`\`\`

### Payment Endpoints

#### POST /api/payments/stkpush
Initiate M-Pesa STK Push.

**Request:**
\`\`\`json
{
  "loan_id": 1,
  "phone_number": "254712345678",
  "amount": 10000
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "message": "Payment request sent to 254712345678",
  "payment_id": 1,
  "checkout_request_id": "ws_CO_123456789"
}
\`\`\`

#### POST /api/payments/callback
M-Pesa callback endpoint (webhook).

**Headers:**
\`\`\`
X-Callback-Token: your-secret-token
\`\`\`

**Request (from Safaricom):**
\`\`\`json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "29115-34620561-1",
      "CheckoutRequestID": "ws_CO_191220191020363925",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          {
            "Name": "Amount",
            "Value": 10000
          },
          {
            "Name": "MpesaReceiptNumber",
            "Value": "NLJ7RT61SV"
          },
          {
            "Name": "TransactionDate",
            "Value": 20191219102115
          },
          {
            "Name": "PhoneNumber",
            "Value": 254712345678
          }
        ]
      }
    }
  }
}
\`\`\`

## Database Models

### User
- id (Primary Key)
- username (Unique)
- email (Unique)
- password_hash
- role (admin/staff)
- created_at

### Client
- id (Primary Key)
- full_name
- phone_number
- id_number (Unique)
- email
- location
- created_at

### Livestock
- id (Primary Key)
- client_id (Foreign Key)
- livestock_type
- count
- estimated_value
- valuation_value
- location
- photos (JSON)
- status
- created_at

### Loan
- id (Primary Key)
- client_id (Foreign Key)
- livestock_id (Foreign Key)
- principal_amount
- interest_rate
- total_amount
- amount_paid
- balance
- disbursement_date
- due_date
- status
- notes
- created_at

### Transaction
- id (Primary Key)
- loan_id (Foreign Key)
- transaction_type
- amount
- payment_method
- mpesa_receipt
- notes
- created_at

### Payment
- id (Primary Key)
- loan_id (Foreign Key)
- phone_number
- amount
- merchant_request_id
- checkout_request_id
- mpesa_receipt_number
- transaction_date
- status
- result_code
- result_desc
- created_at
- updated_at

## Flask Commands

### Database Commands
\`\`\`bash
# Initialize migrations
flask db init

# Create migration
flask db migrate -m "Description"

# Apply migrations
flask db upgrade

# Rollback migration
flask db downgrade
\`\`\`

### Custom Commands
\`\`\`bash
# Seed admin user
flask seed-admin

# Create database tables
flask init-db
\`\`\`

## Testing M-Pesa Integration

### Sandbox Testing

1. **Use test credentials**
\`\`\`env
DARAJA_ENV=sandbox
DARAJA_SHORTCODE=174379
\`\`\`

2. **Test phone numbers**
- 254708374149 (Success)
- 254708374150 (Insufficient funds)
- 254708374151 (User cancelled)

3. **Test with ngrok**
\`\`\`bash
# Start ngrok
ngrok http 5000

# Update callback URL
DARAJA_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/payments/callback
\`\`\`

4. **Monitor callbacks**
\`\`\`bash
# Watch logs
tail -f logs/app.log
\`\`\`

## Production Deployment

### Render Deployment

1. **Create Web Service**
   - Root directory: `backend`
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn wsgi:app`

2. **Add PostgreSQL**
   - Create PostgreSQL database
   - Copy `DATABASE_URL`

3. **Environment Variables**
   - Add all from `.env.example`
   - Set production values

4. **Run migrations**
\`\`\`bash
# In Render shell
flask db upgrade
flask seed-admin
\`\`\`

### Health Check Endpoint

\`\`\`bash
GET /health
\`\`\`

Response:
\`\`\`json
{
  "status": "healthy",
  "database": "connected"
}
\`\`\`

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong SECRET_KEY and JWT_SECRET_KEY
- [ ] Enable HTTPS in production
- [ ] Configure CORS_ORIGINS properly
- [ ] Set secure CALLBACK_SECRET_TOKEN
- [ ] Enable rate limiting
- [ ] Review database permissions
- [ ] Implement backup strategy
- [ ] Monitor error logs
- [ ] Set up alerts for failed payments

## Monitoring

### Logs
\`\`\`bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# Payment logs
tail -f logs/payments.log
\`\`\`

### Database Monitoring
\`\`\`bash
# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
\`\`\`

## Support

For technical issues:
- Check logs first
- Review environment variables
- Test database connection
- Verify M-Pesa credentials
- Contact: nagolie7@gmail.com
