import africastalking
import os
import re
from flask import current_app

class SMSService:
    def __init__(self):
        try:
            # Initialize Africa's Talking
            self.username = os.environ.get('AFRICAS_TALKING_USERNAME', 'sandbox')
            self.api_key = os.environ.get('AFRICAS_TALKING_API_KEY')
            
            # Test mode - set to True to simulate SMS without Africa's Talking
            self.test_mode = os.environ.get('SMS_TEST_MODE', 'True').lower() == 'true'
            
            if not self.api_key and not self.test_mode:
                raise ValueError("AFRICAS_TALKING_API_KEY environment variable is required")
            
            if not self.test_mode:
                africastalking.initialize(self.username, self.api_key)
                self.sms = africastalking.SMS
                print("Africa's Talking SMS service initialized successfully")
            else:
                print("SMS service running in TEST MODE - SMS will be simulated")
            
        except Exception as e:
            print(f"Failed to initialize Africa's Talking: {str(e)}")
            # Fall back to test mode
            self.test_mode = True
            print("Falling back to TEST MODE")

    def send_sms(self, phone_number, message):
        """
        Send SMS using Africa's Talking API or simulate in test mode
        """
        try:
            # Format phone number
            formatted_phone = self.format_phone_number(phone_number)
            
            if self.test_mode:
                # SIMULATE SMS - No actual SMS sent
                print(f"🔵 TEST MODE: Simulating SMS to {formatted_phone}")
                print(f"📱 Message: {message}")
                print(f"✅ SMS would be sent to: {formatted_phone}")
                
                # Simulate a successful response
                return {
                    'success': True,
                    'response': {
                        'SMSMessageData': {
                            'Message': 'Sent to 1/1', 
                            'Recipients': [{'status': 'Success', 'number': formatted_phone}]
                        }
                    },
                    'recipient': formatted_phone,
                    'test_mode': True
                }
            
            # REAL Africa's Talking API call
            print(f"🟢 LIVE MODE: Sending real SMS to {formatted_phone}")
            print(f"📱 Message: {message}")
            
            response = self.sms.send(message, [formatted_phone])
            print(f"SMS API Response: {response}")
            
            # Check response
            recipients = response.get('SMSMessageData', {}).get('Recipients', [{}])
            if recipients and recipients[0].get('status') == 'Success':
                return {
                    'success': True,
                    'response': response,
                    'recipient': formatted_phone
                }
            else:
                error_msg = recipients[0].get('status', 'Unknown error') if recipients else 'No recipients'
                return {
                    'success': False,
                    'error': error_msg,
                    'recipient': formatted_phone
                }
            
        except Exception as e:
            print(f"❌ SMS sending failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'recipient': phone_number
            }

    def format_phone_number(self, phone):
        """
        Format phone number to international format (254...)
        """
        # Remove any non-digit characters and the + if present
        cleaned = ''.join(filter(str.isdigit, str(phone)))
        
        print(f"Original phone: {phone}, Cleaned: {cleaned}")
        
        # Convert to 254 format
        if cleaned.startswith('0'):
            # Convert 07... to 2547...
            formatted = '254' + cleaned[1:]
        elif cleaned.startswith('7') and len(cleaned) == 9:
            # Convert 7... to 2547...
            formatted = '254' + cleaned
        elif cleaned.startswith('254'):
            # Already in correct format
            formatted = cleaned
        else:
            # Return as is
            formatted = cleaned
            
        print(f"Formatted phone: {formatted}")
        return formatted

# Create a global instance
sms_service = SMSService()