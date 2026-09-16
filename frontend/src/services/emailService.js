import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
const TEMPLATE_ID_CONTACT = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_CONTACT;

// Sanity check — helps you spot missing env vars fast
if (!SERVICE_ID || !PUBLIC_KEY || !TEMPLATE_ID_CONTACT) {
  console.warn(
    '[emailService] Missing EmailJS env vars. Check .env and restart dev server.',
    { SERVICE_ID, PUBLIC_KEY, TEMPLATE_ID_CONTACT }
  );
}

emailjs.init({ publicKey: PUBLIC_KEY });

export async function sendContactEmail(data) {
  const templateParams = {
    from_name: data.name,
    from_email: data.email,
    phone: data.phone && data.phone.trim() ? data.phone : 'Not provided',
    message: data.message,
    reply_to: data.email,
    to_email: 'nagolieenterprisesltd@gmail.com',
    from_company: 'Nagolie Enterprises',
    sent_date: new Date().toLocaleString('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Nairobi',
    }),
  };

  return emailjs.send(SERVICE_ID, TEMPLATE_ID_CONTACT, templateParams);
}