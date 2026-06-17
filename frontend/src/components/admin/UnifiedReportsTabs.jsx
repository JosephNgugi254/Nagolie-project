// components/admin/UnifiedReportsTabs.jsx
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import LoanReports from '../loan-reports/LoanReports';
import ValuerPanel from '../recovery/ValuerPanel';

const UnifiedReportsTabs = () => {
  const { user } = useAuth();   // get logged-in user
  const [activeTab, setActiveTab] = useState('officer');

  // Only a valuer can edit (resolve, add notes). Director/admin sees read‑only.
  const isValuer = user?.role === 'valuer';

  return (
    <div>
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'officer' ? 'active' : ''}`}
            onClick={() => setActiveTab('officer')}
          >
            Officer Daily Loan Reports
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'valuer' ? 'active' : ''}`}
            onClick={() => setActiveTab('valuer')}
          >
            Valuer Recovery Reports
          </button>
        </li>
      </ul>
      {activeTab === 'officer' ? (
        <LoanReports />
      ) : (
        <ValuerPanel editable={isValuer} />   // <-- pass editable flag
      )}
    </div>
  );
};

export default UnifiedReportsTabs;