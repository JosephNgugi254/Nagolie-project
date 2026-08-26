import { useState } from 'react';
import ReportsPanel from './ReportsPanel';
import ValuerPanel from './ValuerPanel';

const AnnieReportsTabs = () => {
  const [activeTab, setActiveTab] = useState('daily');

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
      {activeTab === 'daily' ? <ReportsPanel /> : <ValuerPanel editable={true} />}
    </div>
  );
};

export default AnnieReportsTabs;