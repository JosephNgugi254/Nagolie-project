import requests
import base64
from datetime import datetime
from flask import current_app

class DarajaAPI:
    """M-Pesa Daraja API Integration"""
    
    def __init__(self):
        self.consumer_key = current_app.config['DARAJA_CONSUMER_KEY']
        self.consumer_secret = current_app.config['DARAJA_CONSUMER_SECRET']
        self.shortcode = current_app.config['DARAJA_SHORTCODE']
        self.passkey = current_app.config['DARAJA_PASSKEY']
        self.env = current_app.config['DARAJA_ENV']
        
        # Set base URL based on environment
        if self.env == 'production':
            self.base_url = 'https://api.safaricom.co.ke'
        else:
            self.base_url = 'https://sandbox.safaricom.co.ke'
    
    def get_access_token(self):
        """Generate OAuth access token"""
        url = f'{self.base_url}/oauth/v1/generate?grant_type=client_credentials'
        
        try:
            response = requests.get(
                url,
                auth=(self.consumer_key, self.consumer_secret)
            )
            response.raise_for_status()
            return response.json().get('access_token')
        except requests.exceptions.RequestException as e:
            print(f"Error getting access token: {str(e)}")
            return None
    
    def stk_push(self, phone_number, amount, account_reference, callback_url):
        """Initiate STK Push request"""
        access_token = self.get_access_token()
        
        if not access_token:
            return {'success': False, 'error': 'Failed to get access token'}
        
        # Format phone number (remove + and ensure it starts with 254)
        phone = phone_number.replace('+', '').replace(' ', '')
        if phone.startswith('0'):
            phone = '254' + phone[1:]
        elif not phone.startswith('254'):
            phone = '254' + phone
        
        # Generate timestamp and password
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password_str = f"{self.shortcode}{self.passkey}{timestamp}"
        password = base64.b64encode(password_str.encode()).decode('utf-8')
        
        url = f'{self.base_url}/mpesa/stkpush/v1/processrequest'
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'BusinessShortCode': self.shortcode,
            'Password': password,
            'Timestamp': timestamp,
            'TransactionType': 'CustomerPayBillOnline',
            'Amount': int(amount),
            'PartyA': phone,
            'PartyB': self.shortcode,
            'PhoneNumber': phone,
            'CallBackURL': callback_url,
            'AccountReference': account_reference,
            'TransactionDesc': f'Loan payment for {account_reference}'
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()
            
            return {
                'success': True,
                'merchant_request_id': result.get('MerchantRequestID'),
                'checkout_request_id': result.get('CheckoutRequestID'),
                'response_code': result.get('ResponseCode'),
                'response_description': result.get('ResponseDescription'),
                'customer_message': result.get('CustomerMessage')
            }
        except requests.exceptions.RequestException as e:
            print(f"STK Push error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
