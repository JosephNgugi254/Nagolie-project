# In daraja.py - Add rate limiting protection
import requests
import base64
from datetime import datetime, timedelta
import os
import time
import json

class DarajaAPI:
    def __init__(self):
        self.consumer_key = os.getenv('DARAJA_CONSUMER_KEY')
        self.consumer_secret = os.getenv('DARAJA_CONSUMER_SECRET')
        self.shortcode = os.getenv('DARAJA_SHORTCODE')
        self.passkey = os.getenv('DARAJA_PASSKEY')
        self.base_url = "https://sandbox.safaricom.co.ke"
        
        # Cache for access token
        self._access_token = None
        self._token_expiry = None
        
        # Rate limiting protection
        self._last_request_time = 0
        self._min_request_interval = 2  # Minimum 2 seconds between requests

    def _rate_limit(self):
        """Implement rate limiting to avoid 429 errors"""
        current_time = time.time()
        time_since_last_request = current_time - self._last_request_time
        
        if time_since_last_request < self._min_request_interval:
            sleep_time = self._min_request_interval - time_since_last_request
            print(f"Rate limiting: sleeping for {sleep_time:.2f} seconds")
            time.sleep(sleep_time)
        
        self._last_request_time = time.time()

    def get_access_token(self, force_refresh=False):
        """Get M-Pesa access token with caching and rate limiting"""
        try:
            # Return cached token if still valid (55 minutes)
            if not force_refresh and self._access_token and self._token_expiry:
                if datetime.now() < self._token_expiry:
                    print("Using cached access token")
                    return self._access_token
            
            # Apply rate limiting
            self._rate_limit()
            
            # Encode consumer key and secret
            credentials = f"{self.consumer_key}:{self.consumer_secret}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                'Authorization': f'Basic {encoded_credentials}',
                'Content-Type': 'application/json'
            }
            
            print(f"Requesting new access token from: {self.base_url}/oauth/v1/generate?grant_type=client_credentials")
            
            response = requests.get(
                f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
                headers=headers,
                timeout=30
            )
            
            print(f"Access token response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                access_token = data.get('access_token')
                if access_token:
                    print("Successfully obtained new access token")
                    # Cache the token for 55 minutes
                    self._access_token = access_token
                    self._token_expiry = datetime.now() + timedelta(minutes=55)
                    return access_token
                else:
                    print(f"No access token in response: {data}")
                    return None
            elif response.status_code == 429:
                print("Rate limited when getting access token")
                return None
            else:
                print(f"Failed to get access token: HTTP {response.status_code}, Response: {response.text}")
                return None
                
        except Exception as e:
            print(f"Exception getting access token: {str(e)}")
            return None

    def stk_push(self, phone_number, amount, account_reference, callback_url):
        """Send STK push to customer with rate limiting"""
        try:
            # Get access token first
            access_token = self.get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to get access token'}
            
            # Apply rate limiting
            self._rate_limit()
            
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
                "Amount": int(float(amount)),
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
            elif response.status_code == 429:
                return {
                    'success': False,
                    'error': 'Rate limited by Daraja. Please try again in a moment.'
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
        """Check status of STK push request with enhanced rate limiting"""
        try:
            # Apply rate limiting before even trying to get token
            self._rate_limit()
            
            # Try to get access token, retry once if failed
            access_token = self.get_access_token()
            if not access_token:
                # Wait a bit before retry
                time.sleep(3)
                access_token = self.get_access_token(force_refresh=True)
                if not access_token:
                    return {'success': False, 'error': 'Failed to get access token after retry'}

            url = f"{self.base_url}/mpesa/stkpushquery/v1/query"
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            password = base64.b64encode(
                f"{self.shortcode}{self.passkey}{timestamp}".encode()
            ).decode()

            payload = {
                "BusinessShortCode": self.shortcode,
                "Password": password,
                "Timestamp": timestamp,
                "CheckoutRequestID": checkout_request_id
            }

            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }

            print(f"Checking STK status for: {checkout_request_id}")

            response = requests.post(url, json=payload, headers=headers, timeout=30)
            
            # Handle JSON parsing more gracefully
            try:
                response_data = response.json()
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}, Response text: {response.text[:200]}...")
                # Check if this is a rate limit response
                if response.status_code == 429:
                    return {
                        'success': False,
                        'error': 'Rate limited by Daraja. Please wait before checking again.',
                        'retry_after': 30
                    }
                return {
                    'success': False,
                    'error': f'Invalid response from Daraja: {response.status_code}'
                }

            print(f"STK Status Response: {response_data}")

            if response.status_code == 200:
                return {
                    'success': True,
                    'status': response_data
                }
            elif response.status_code == 429:
                return {
                    'success': False,
                    'error': 'Rate limited by Daraja. Please wait before checking again.',
                    'retry_after': 30
                }
            else:
                error_msg = response_data.get('errorMessage', f'HTTP {response.status_code}: Failed to check status')
                return {
                    'success': False,
                    'error': error_msg
                }

        except requests.exceptions.RequestException as e:
            print(f"STK status check request error: {str(e)}")
            return {'success': False, 'error': f'Network error: {str(e)}'}
        except Exception as e:
            print(f"STK status check error: {str(e)}")
            return {'success': False, 'error': str(e)}