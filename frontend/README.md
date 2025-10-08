# Nagolie Frontend

React + Vite frontend for livestock-backed lending platform.

## Quick Start

\`\`\`bash
npm install
npm install react-toastify
npm install jspdf
npm run dev
\`\`\`

## Project Structure

\`\`\`
src/
├── components/
│   ├── common/          # Reusable UI components
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   ├── Button.jsx
│   │   ├── Modal.jsx
│   │   └── FormInput.jsx
│   └── admin/           # Admin-specific components
│       ├── AdminSidebar.jsx
│       ├── AdminTable.jsx
│       └── AdminCard.jsx
├── features/            # Feature-based modules
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   └── useAuth.js
│   ├── payments/
│   │   ├── PaymentForm.jsx
│   │   └── PaymentStatus.jsx
│   ├── loans/
│   │   └── LoanApply.jsx
│   └── clients/
│       ├── ClientList.jsx
│       └── ClientProfile.jsx
├── pages/               # Page components
│   ├── Home.jsx
│   ├── Dashboard.jsx
│   └── AdminPanel.jsx
├── services/            # API services
│   └── api.js
├── context/             # React Context
│   └── AuthContext.jsx
├── App.jsx
├── main.jsx
└── index.css
\`\`\`

## Available Scripts

### Development
\`\`\`bash
npm run dev          # Start dev server
\`\`\`

### Production
\`\`\`bash
npm run build        # Build for production
npm run preview      # Preview production build
\`\`\`

## Environment Variables

Create `.env` file:
\`\`\`env
VITE_API_URL=http://localhost:5000
\`\`\`

## API Integration

All API calls go through `src/services/api.js`:

\`\`\`javascript
import { clientAPI, loanAPI, paymentAPI } from './services/api'

// Example usage
const clients = await clientAPI.getAll()
const loan = await loanAPI.create(loanData)
const payment = await paymentAPI.initiateSTK(paymentData)
\`\`\`

## Authentication

Uses `AuthContext` for global auth state:

\`\`\`javascript
import { useAuth } from './context/AuthContext'

function MyComponent() {
  const { user, login, logout, isAuthenticated } = useAuth()
  
  // Use auth state
}
\`\`\`

## Routing

Protected routes redirect to login:

\`\`\`javascript
import { Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

function ProtectedPage() {
  const { isAuthenticated } = useAuth()
  
  if (!isAuthenticated) {
    return <Navigate to="/admin" replace />
  }
  
  return <div>Protected content</div>
}
\`\`\`

## Styling

Uses Bootstrap 5 + custom CSS:
- Bootstrap classes for layout
- Custom CSS variables in `index.css`
- Component-specific styles inline or in CSS modules

## Deployment

### Vercel
\`\`\`bash
vercel
\`\`\`

### Netlify
\`\`\`bash
npm run build
netlify deploy --prod
\`\`\`

### Build Output
\`\`\`bash
npm run build
# Output in dist/ folder
\`\`\`

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance

- Code splitting with React.lazy
- Image optimization
- Minified production builds
- Gzip compression

## Troubleshooting

### API Connection Issues
- Check `VITE_API_URL` in `.env`
- Verify backend is running
- Check CORS configuration

### Build Errors
\`\`\`bash
rm -rf node_modules package-lock.json
npm install
npm run build
\`\`\`

### Hot Reload Not Working
\`\`\`bash
# Restart dev server
npm run dev
