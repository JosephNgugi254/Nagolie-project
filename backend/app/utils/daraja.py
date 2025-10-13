# In your daraja.py or wherever DarajaAPI is defined
import requests
import base64
from datetime import datetime
import os

class DarajaAPI:
    def __init__(self):
        self.consumer_key = os.getenv('DARAJA_CONSUMER_KEY')
        self.consumer_secret = os.getenv('DARAJA_CONSUMER_SECRET')
        self.shortcode = os.getenv('DARAJA_SHORTCODE')
        self.passkey = os.getenv('DARAJA_PASSKEY')
        self.base_url = "https://sandbox.safaricom.co.ke"  # Use production URL when live
        
        # Debug: Print credentials (remove this in production)
        print(f"Daraja Config - Consumer Key: {self.consumer_key}")
        print(f"Daraja Config - Shortcode: {self.shortcode}")
        print(f"Daraja Config - Passkey: {self.passkey}")

    def get_access_token(self):
        """Get M-Pesa access token"""
        try:
            # Encode consumer key and secret
            credentials = f"{self.consumer_key}:{self.consumer_secret}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                'Authorization': f'Basic {encoded_credentials}',
                'Content-Type': 'application/json'
            }
            
            print(f"Requesting access token from: {self.base_url}/oauth/v1/generate?grant_type=client_credentials")
            
            response = requests.get(
                f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
                headers=headers,
                timeout=30
            )
            
            print(f"Access token response status: {response.status_code}")
            print(f"Access token response body: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                access_token = data.get('access_token')
                if access_token:
                    print(f"Successfully obtained access token")
                    return access_token
                else:
                    print(f"No access token in response: {data}")
                    return None
            else:
                print(f"Failed to get access token: HTTP {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Exception getting access token: {str(e)}")
            return None

    def stk_push(self, phone_number, amount, account_reference, callback_url):
        """Send STK push to customer"""
        try:
            # Get access token first
            access_token = self.get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to get access token'}
            
            print(f"Successfully obtained access token: {access_token[:20]}...")
            
            # Prepare STK push request
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            password = base64.b64encode(
                f"{self.shortcode}{self.passkey}{timestamp}".encode()
            ).decode()
            
            payload = {
                "BusinessShortCode": self.shortcode,
                "Password": password,
                "Timestamp": timestamp,
                "TransactionType": "CustomerPayBillOnline",
                "Amount": int(float(amount)),  # Ensure it's integer
                "PartyA": phone_number,
                "PartyB": self.shortcode,
                "PhoneNumber": phone_number,
                "CallBackURL": callback_url,
                "AccountReference": account_reference,
                "TransactionDesc": "Loan Payment"
            }
            
            print(f"STK Push Payload: {payload}")
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            response = requests.post(
                f"{self.base_url}/mpesa/stkpush/v1/processrequest",
                json=payload,
                headers=headers,
                timeout=30
            )
            
            print(f"STK Push Response Status: {response.status_code}")
            print(f"STK Push Response Body: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                if 'ResponseCode' in data and data['ResponseCode'] == '0':
                    return {
                        'success': True,
                        'merchant_request_id': data.get('MerchantRequestID'),
                        'checkout_request_id': data.get('CheckoutRequestID'),
                        'customer_message': data.get('CustomerMessage'),
                        'response_code': data.get('ResponseCode'),
                        'rounded_amount': int(float(amount))
                    }
                else:
                    error_msg = data.get('errorMessage', 'STK push failed')
                    return {
                        'success': False,
                        'error': error_msg
                    }
            else:
                return {
                    'success': False,
                    'error': f'HTTP {response.status_code}: {response.text}'
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': f'STK push exception: {str(e)}'
            }
        
    def check_stk_status(self, checkout_request_id):
        """Check status of STK push request"""
        try:
            access_token = self.get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to get access token'}

            url = f"{self.base_url}/mpesa/stkpushquery/v1/query"
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            password = base64.b64encode(
                f"{self.shortcode}{self.passkey}{timestamp}".encode()  # FIXED: Use self.shortcode instead of self.business_shortcode
            ).decode()

            payload = {
                "BusinessShortCode": self.shortcode,  # FIXED: Use self.shortcode
                "Password": password,
                "Timestamp": timestamp,
                "CheckoutRequestID": checkout_request_id
            }

            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }

            print(f"Checking STK status for: {checkout_request_id}")
            print(f"STK Query Payload: {payload}")

            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response_data = response.json()

            print(f"STK Status Response: {response_data}")

            if response.status_code == 200:
                return {
                    'success': True,
                    'status': response_data
                }
            else:
                return {
                    'success': False,
                    'error': response_data.get('errorMessage', 'Failed to check status')
                }

        except Exception as e:
            print(f"STK status check error: {str(e)}")
            return {'success': False, 'error': str(e)}