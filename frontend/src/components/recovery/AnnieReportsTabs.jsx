import { useState, useEffect } from 'react';
import ReportsPanel from './ReportsPanel';
import ValuerPanel from './ValuerPanel';

const AnnieReportsTabs = () => {
  const [activeTab, setActiveTab] = useState('daily');

  // On mount — if there's a queued jump, force the Daily tab
  useEffect(() => {
    if (sessionStorage.getItem('reportJumpToDate')) setActiveTab('daily');
  }, []);

  // Live jump event while Annie is already on this screen
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.date) setActiveTab('daily');
    };
    window.addEventListener('reportJump', handler);
    return () => window.removeEventListener('reportJump', handler);
  }, []);

  return (
    <div>
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => setActiveTab('daily')}
          >
            Daily Loan Reports
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'recovery' ? 'active' : ''}`}
            onClick={() => setActiveTab('recovery')}
          >
            Recovery Report
          </button>
        </li>
      </ul>
      {activeTab === 'daily'
        ? <ReportsPanel />
        : <ValuerPanel editable={false} monitorMode={true} canResolve={false} />}
    </div>
  );
};

export default AnnieReportsTabs;