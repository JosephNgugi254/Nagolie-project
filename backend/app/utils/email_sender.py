import os
import requests
from flask import current_app
import json

class EmailSender:
    """Email sender using EmailJS"""
    
    @staticmethod
    def send_password_reset_email(to_email, reset_link, investor_name, security_question):
        """
        Send password reset email using EmailJS
        """
        try:
            # Get EmailJS configuration from environment variables
            emailjs_user_id = os.environ.get('EMAILJS_USER_ID')
            emailjs_service_id = os.environ.get('EMAILJS_SERVICE_ID')
            emailjs_template_id = os.environ.get('EMAILJS_PASSWORD_RESET_TEMPLATE_ID')
            emailjs_access_token = os.environ.get('EMAILJS_ACCESS_TOKEN')
            
            if not all([emailjs_user_id, emailjs_service_id, emailjs_template_id]):
                current_app.logger.error("EmailJS configuration missing")
                return False
            
            # Prepare email data
            template_params = {
                'to_email': to_email,
                'investor_name': investor_name,
                'reset_link': reset_link,
                'security_question': security_question,
                'reply_to': 'nagolieenterprises@gmail.com',
                'from_name': 'Nagolie Enterprises'
            }
            
            # Send email via EmailJS
            response = requests.post(
                'https://api.emailjs.com/api/v1.0/email/send',
                json={
                    'service_id': emailjs_service_id,
                    'template_id': emailjs_template_id,
                    'user_id': emailjs_user_id,
                    'accessToken': emailjs_access_token,
                    'template_params': template_params
                },
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                current_app.logger.info(f"Password reset email sent to {to_email}")
                return True
            else:
                current_app.logger.error(f"EmailJS error: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            current_app.logger.error(f"Error sending email: {str(e)}")
            return False
    
    @staticmethod
    def send_password_changed_email(to_email, investor_name):
        """
        Send password changed confirmation email
        """
        try:
            emailjs_user_id = os.environ.get('EMAILJS_USER_ID')
            emailjs_service_id = os.environ.get('EMAILJS_SERVICE_ID')
            emailjs_template_id = os.environ.get('EMAILJS_PASSWORD_CHANGED_TEMPLATE_ID')
            emailjs_access_token = os.environ.get('EMAILJS_ACCESS_TOKEN')
            
            if not all([emailjs_user_id, emailjs_service_id, emailjs_template_id]):
                current_app.logger.error("EmailJS configuration missing")
                return False
            
            template_params = {
                'to_email': to_email,
                'investor_name': investor_name,
                'reply_to': 'nagolieenterprises@gmail.com',
                'from_name': 'Nagolie Enterprises'
            }
            
            response = requests.post(
                'https://api.emailjs.com/api/v1.0/email/send',
                json={
                    'service_id': emailjs_service_id,
                    'template_id': emailjs_template_id,
                    'user_id': emailjs_user_id,
                    'accessToken': emailjs_access_token,
                    'template_params': template_params
                },
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                current_app.logger.info(f"Password changed email sent to {to_email}")
                return True
            else:
                current_app.logger.error(f"EmailJS error: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            current_app.logger.error(f"Error sending email: {str(e)}")
            return False