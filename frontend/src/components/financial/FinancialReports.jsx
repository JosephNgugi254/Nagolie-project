import React, { useState, useEffect, useRef } from 'react';
import { financialAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  ArcElement,
  Filler
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { formatCurrency, generateFinancialReportPDF } from '../admin/ReceiptPDF';
import html2canvas from 'html2canvas';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  ArcElement,
  Filler
);

const FinancialReports = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState('loan'); // 'loan', 'company', 'insights'

  // Period state – weekly uses a single date (Sunday)
  const [periodType, setPeriodType] = useState('weekly');
  const [weekDate, setWeekDate] = useState(() => {
    const today = new Date();
    const day = today.getDay(); // 0=Sunday, 6=Saturday
    const diff = today.getDate() - day; // subtract to get Sunday
    const sunday = new Date(today);
    sunday.setDate(diff);
    return sunday.toISOString().split('T')[0];
  });
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Chart type
  const [chartType, setChartType] = useState('line');

  // Data states
  const [loanData, setLoanData] = useState(null);
  const [companyData, setCompanyData] = useState(null);
  const [insightsData, setInsightsData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Refs for PDF capture
  const reportRef = useRef(null);

  // Fetch data when filters change
  useEffect(() => {
    if (activeTab === 'loan') fetchLoanData();
    else if (activeTab === 'company') fetchCompanyData();
    else if (activeTab === 'insights') fetchInsights();
  }, [activeTab, periodType, weekDate, monthYear]);

  const fetchLoanData = async () => {
    setLoading(true);
    try {
      const params = { period_type: periodType };
      if (periodType === 'weekly') {
        params.date = weekDate;
      } else {
        params.month = monthYear;
      }
      const response = await financialAPI.getLoanReport(params);
      setLoanData(response.data);
    } catch (error) {
      showToast.error('Failed to load loan report');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyData = async () => {
    setLoading(true);
    try {
      const params = { period_type: periodType };
      if (periodType === 'weekly') {
        params.date = weekDate;
      } else {
        params.month = monthYear;
      }
      const response = await financialAPI.getCompanyReport(params);
      setCompanyData(response.data);
    } catch (error) {
      showToast.error('Failed to load company report');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInsights = async () => {
    try {
      const response = await financialAPI.getInsights();
      setInsightsData(response.data);
    } catch (error) {
      showToast.error('Failed to load insights');
      console.error(error);
    }
  };

  // Generate PDF report using ReceiptPDF's generateFinancialReportPDF
  const generateReportPDF = async (preview = true) => {
    if (!reportRef.current) return;
    try {
      // Capture the chart area
      const chartElement = reportRef.current.querySelector('.chart-wrapper');
      if (!chartElement) {
        showToast.error('Chart not found');
        return;
      }
      const canvas = await html2canvas(chartElement, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');

      // Build period label
      let periodLabel = '';
      if (periodType === 'weekly') {
        const start = new Date(weekDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        periodLabel = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
      } else {
        const [year, month] = monthYear.split('-').map(Number);
        const dateObj = new Date(year, month - 1, 1);
        periodLabel = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
      }

      // Prepare chart image data for PDF
      const chartImageData = {
        data: imgData,
        width: canvas.width,
        height: canvas.height,
      };

      // Get report data
      const data = activeTab === 'loan' ? loanData : companyData;
      if (!data) {
        showToast.error('No data to generate report');
        return;
      }

      // Generate PDF – pass preview flag
      const result = await generateFinancialReportPDF(
        data,
        periodLabel,
        chartImageData,
        activeTab === 'loan' ? 'loan' : 'company',
        preview
      );

      if (preview) {
        // Open the blob in a new tab
        const url = URL.createObjectURL(result);
        window.open(url, '_blank');
        // Revoke after a short delay to allow the tab to open
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast.success('Report opened in new tab (preview)');
      } else {
        showToast.success('Report downloaded');
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      showToast.error('Failed to generate PDF');
    }
  };

  const renderLoanContent = () => {
    if (!loanData) return <div className="text-center">No data</div>;
    const data = loanData;

    // For chart: we'll create a bar chart with key metrics
    const chartLabels = ['Money Lent', 'Principal Collected', 'Interest Collected', 'Outstanding Principal', 'Outstanding Interest'];
    const chartValues = [
      data.total_money_lent,
      data.principal_collected,
      data.interest_collected,
      data.outstanding_principal,
      data.outstanding_interest,
    ];

    const chartColors = ['#1e40af', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    let ChartComponent;
    let chartProps = {
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Amount (KES)',
            data: chartValues,
            backgroundColor: chartColors,
            borderColor: chartColors.map(c => c),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatCurrency(ctx.raw),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => formatCurrency(val),
            },
          },
        },
      },
    };

    if (chartType === 'pie') {
      ChartComponent = Pie;
      chartProps = {
        data: {
          labels: chartLabels,
          datasets: [
            {
              data: chartValues,
              backgroundColor: chartColors,
              borderColor: '#fff',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}`,
              },
            },
          },
        },
      };
    } else if (chartType === 'line') {
      ChartComponent = Line;
      chartProps = {
        data: {
          labels: chartLabels,
          datasets: [
            {
              label: 'Amount (KES)',
              data: chartValues,
              borderColor: '#1e40af',
              backgroundColor: 'rgba(30, 64, 175, 0.1)',
              fill: true,
              tension: 0.4,
              pointBackgroundColor: chartColors,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => formatCurrency(ctx.raw),
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (val) => formatCurrency(val),
              },
            },
          },
        },
      };
    } else {
      ChartComponent = Bar;
    }

    return (
      <div ref={reportRef}>
        {/* Summary Cards */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="card-subtitle text-muted">Money Lent</h6>
                <h4 className="card-title">{formatCurrency(data.total_money_lent)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="card-subtitle text-muted">Principal Collected</h6>
                <h4 className="card-title">{formatCurrency(data.principal_collected)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="card-subtitle text-muted">Interest Collected</h6>
                <h4 className="card-title">{formatCurrency(data.interest_collected)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="card-subtitle text-muted">Recovery Rate</h6>
                <h4 className="card-title">{data.loan_recovery_rate.toFixed(2)}%</h4>
              </div>
            </div>
          </div>
        </div>

        {/* Claims & Waived */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="card border-danger">
              <div className="card-body">
                <h6 className="card-subtitle text-danger">Total Claimed</h6>
                <h4 className="card-title">{formatCurrency(data.total_claimed_amount)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card border-success">
              <div className="card-body">
                <h6 className="card-subtitle text-success">Recovered Value</h6>
                <h4 className="card-title">{formatCurrency(data.total_recovered_value)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card border-warning">
              <div className="card-body">
                <h6 className="card-subtitle text-warning">Claims P/L</h6>
                <h4 className={`card-title ${data.claims_profit_loss >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(data.claims_profit_loss)}
                </h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card border-secondary">
              <div className="card-body">
                <h6 className="card-subtitle text-secondary">Total Waived</h6>
                <h4 className="card-title">{formatCurrency(data.total_waived_amount)}</h4>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="card">
          <div className="card-body">
            <div className="chart-wrapper d-flex justify-content-center">
              <div style={{ width: '100%', maxWidth: '800px', height: '350px' }}>
                <ChartComponent {...chartProps} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCompanyContent = () => {
    if (!companyData) return <div className="text-center">No data</div>;
    const data = companyData;
    
    // Prepare category arrays
    const moneyInCategories = [
      { label: 'Principal Payments', value: data.money_in.principal_payments || 0 },
      { label: 'Interest Payments', value: data.money_in.interest_payments || 0 },
      { label: 'Claims Recoveries', value: data.money_in.claims_recoveries || 0 },
      { label: 'Other Income', value: data.money_in.other_income || 0 },
    ];
  
    const moneyOutCategories = [
      { label: 'Loan Disbursements', value: data.money_out.loan_disbursements || 0 },
      { label: 'Loan Top-ups', value: data.money_out.loan_topups || 0 },
      { label: 'Petty Cash', value: data.money_out.petty_cash || 0 },
      { label: 'Operational', value: data.money_out.operational || 0 },
      { label: 'Salaries', value: data.money_out.salaries || 0 },
      { label: 'Investor Returns', value: data.money_out.investor_returns || 0 },
    ];
  
    // Helper to build chart props for a given dataset
    const buildChartProps = (labels, values, colors, label = 'Amount (KES)') => {
      const commonOptions = {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatCurrency(ctx.raw),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => formatCurrency(val),
            },
          },
        },
      };
    
      if (chartType === 'pie') {
        return {
          data: {
            labels: labels,
            datasets: [
              {
                data: values,
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}`,
                },
              },
            },
          },
        };
      }
    
      if (chartType === 'line') {
        return {
          data: {
            labels: labels,
            datasets: [
              {
                label: label,
                data: values,
                borderColor: '#1e40af',
                backgroundColor: 'rgba(30, 64, 175, 0.1)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: colors,
              },
            ],
          },
          options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, legend: { display: false } },
          },
        };
      }
    
      // Bar chart (default)
      return {
        data: {
          labels: labels,
          datasets: [
            {
              label: label,
              data: values,
              backgroundColor: colors,
              borderColor: colors.map(c => c),
              borderWidth: 1,
            },
          ],
        },
        options: commonOptions,
      };
    };
  
    const inColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
    const outColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#fee2e2'];
  
    const inLabels = moneyInCategories.map(c => c.label);
    const inValues = moneyInCategories.map(c => c.value);
    const outLabels = moneyOutCategories.map(c => c.label);
    const outValues = moneyOutCategories.map(c => c.value);
  
    const inProps = buildChartProps(inLabels, inValues, inColors);
    const outProps = buildChartProps(outLabels, outValues, outColors);
  
    const ChartComponent = chartType === 'pie' ? Pie : chartType === 'line' ? Line : Bar;
  
    return (
      <div ref={reportRef}>
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="card bg-success text-white">
              <div className="card-body">
                <h6 className="card-subtitle">Money In</h6>
                <h4 className="card-title">{formatCurrency(data.money_in.total)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card bg-danger text-white">
              <div className="card-body">
                <h6 className="card-subtitle">Money Out</h6>
                <h4 className="card-title">{formatCurrency(data.money_out.total)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card bg-info text-white">
              <div className="card-body">
                <h6 className="card-subtitle">Revenue</h6>
                <h4 className="card-title">{formatCurrency(data.revenue)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card bg-warning text-dark">
              <div className="card-body">
                <h6 className="card-subtitle">Profit/Loss</h6>
                <h4 className="card-title">{formatCurrency(data.profit_loss || data.revenue)}</h4>
              </div>
            </div>
          </div>
        </div>
    
        <div className="row">
          <div className="col-md-6 mb-4">
            <div className="card h-100">
              <div className="card-header bg-success text-white">
                <h6 className="mb-0">Money In Breakdown</h6>
              </div>
              <div className="card-body">
                <div className="chart-wrapper" style={{ height: '280px' }}>
                  <ChartComponent {...inProps} />
                </div>
              </div>
            </div>
          </div>
          <div className="col-md-6 mb-4">
            <div className="card h-100">
              <div className="card-header bg-danger text-white">
                <h6 className="mb-0">Money Out Breakdown</h6>
              </div>
              <div className="card-body">
                <div className="chart-wrapper" style={{ height: '280px' }}>
                  <ChartComponent {...outProps} />
                </div>
              </div>
            </div>
          </div>
        </div>
    
        {/* Optional: a small summary table of categories */}
        <div className="card mt-3">
          <div className="card-body">
            <div className="row">
              <div className="col-md-6">
                <h6 className="text-success">Money In Details</h6>
                <ul className="list-unstyled">
                  {moneyInCategories.map((cat, i) => (
                    <li key={i} className="d-flex justify-content-between border-bottom py-1">
                      <span>{cat.label}</span>
                      <span className="fw-bold">{formatCurrency(cat.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="col-md-6">
                <h6 className="text-danger">Money Out Details</h6>
                <ul className="list-unstyled">
                  {moneyOutCategories.map((cat, i) => (
                    <li key={i} className="d-flex justify-content-between border-bottom py-1">
                      <span>{cat.label}</span>
                      <span className="fw-bold">{formatCurrency(cat.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInsights = () => {
    if (!insightsData) return <div className="text-center">No insights</div>;
    return (
      <div className="card">
        <div className="card-body">
          <ul className="list-group list-group-flush">
            {Object.entries(insightsData).map(([key, value]) => (
              <li key={key} className="list-group-item d-flex justify-content-between align-items-center">
                <span className="text-capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="badge bg-primary rounded-pill">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className="financial-reports">
      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'loan' ? 'active' : ''}`}
            onClick={() => setActiveTab('loan')}
          >
            Loan Report
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'company' ? 'active' : ''}`}
            onClick={() => setActiveTab('company')}
          >
            Company Report
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            Insights
          </button>
        </li>
      </ul>

      {/* Filters */}
      <div className="row g-3 align-items-end mb-4">
        <div className="col-md-3">
          <label className="form-label">Period</label>
          <div className="btn-group w-100" role="group">
            <button
              className={`btn ${periodType === 'weekly' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setPeriodType('weekly')}
            >
              Weekly
            </button>
            <button
              className={`btn ${periodType === 'monthly' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setPeriodType('monthly')}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="col-md-3">
          {periodType === 'weekly' ? (
            <>
              <label className="form-label">Week (Sunday)</label>
              <input
                type="date"
                className="form-control"
                value={weekDate}
                onChange={(e) => setWeekDate(e.target.value)}
              />
            </>
          ) : (
            <>
              <label className="form-label">Month</label>
              <input
                type="month"
                className="form-control"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="col-md-3">
          <label className="form-label">Chart Type</label>
          <div className="btn-group w-100" role="group">
            <button
              className={`btn ${chartType === 'line' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => setChartType('line')}
            >
              Line
            </button>
            <button
              className={`btn ${chartType === 'bar' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => setChartType('bar')}
            >
              Bar
            </button>
            <button
              className={`btn ${chartType === 'pie' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => setChartType('pie')}
            >
              Pie
            </button>
          </div>
        </div>
        <div className="col-md-3 d-flex gap-2">
          <button
            className="btn btn-outline-primary flex-fill"
            onClick={() => generateReportPDF(true)}
            disabled={loading}
          >
            <i className="fas fa-eye me-1"></i> Preview
          </button>
          <button
            className="btn btn-primary flex-fill"
            onClick={() => generateReportPDF(false)}
            disabled={loading}
          >
            <i className="fas fa-download me-1"></i> Download
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <>
          {activeTab === 'loan' && renderLoanContent()}
          {activeTab === 'company' && renderCompanyContent()}
          {activeTab === 'insights' && renderInsights()}
        </>
      )}
    </div>
  );
};

export default FinancialReports;