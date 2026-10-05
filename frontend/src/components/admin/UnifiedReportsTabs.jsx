// components/admin/UnifiedReportsTabs.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import LoanReports from '../loan-reports/LoanReports';
import ValuerPanel from '../recovery/ValuerPanel';

/**
 * Which roles may see the "Recovery Reports" tab at all.
 * Keep in sync with the backend decorator on
 * `GET /api/recovery/flagged-clients`.
 */
const CAN_SEE_RECOVERY_REPORTS = (user) => {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const username = (user.username || '').toLowerCase();
  return (
    ['valuer', 'admin', 'director', 'hr_manager'].includes(role) ||
    username === 'annie'
  );
};

const UnifiedReportsTabs = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('officer');

  const canSeeRecovery = CAN_SEE_RECOVERY_REPORTS(user);
  const isValuer = (user?.role || '').toLowerCase() === 'valuer';

  // If the user's role changes (e.g. logout/login as someone else) or they
  // aren't permitted to see recovery reports, force the active tab back to
  // 'officer' so ValuerPanel never mounts for them.
  useEffect(() => {
    if (!canSeeRecovery && activeTab !== 'officer') {
      setActiveTab('officer');
    }
  }, [canSeeRecovery, activeTab]);

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

        {canSeeRecovery && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'valuer' ? 'active' : ''}`}
              onClick={() => setActiveTab('valuer')}
            >
              Recovery Reports
            </button>
          </li>
        )}
      </ul>

      {activeTab === 'officer' ? (
        <LoanReports />
      ) : (
        // Double-guard: even if state somehow flipped, we never render
        // ValuerPanel for a role that isn't allowed to see it.
        canSeeRecovery && <ValuerPanel editable={isValuer} />
      )}
    </div>
  );
};

export default UnifiedReportsTabs;