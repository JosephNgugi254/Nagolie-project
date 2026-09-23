import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Filler,
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

// ------------------------------------------------------------------ helpers
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonthISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Simple stable hash so the chart re-mounts whenever the underlying
// dataset or the active filter changes. Cheap and deterministic.
function dataSignature(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(Math.random());
  }
}

const FinancialReports = () => {
  // ------------------------- state ---------------------------------------
  const [activeTab, setActiveTab] = useState('loan'); // loan | company | insights

  const [periodType, setPeriodType] = useState('weekly'); // weekly | monthly | daily | custom
  const [weekDate, setWeekDate]     = useState(() => todayISO());
  const [monthYear, setMonthYear]   = useState(() => currentMonthISO());
  const [dayDate, setDayDate]       = useState(() => todayISO());
  const [customStart, setCustomStart] = useState(() => todayISO());
  const [customEnd,   setCustomEnd]   = useState(() => todayISO());

  const [chartType, setChartType] = useState('line'); // line | bar | pie

  const [loanData, setLoanData]         = useState(null);
  const [companyData, setCompanyData]   = useState(null);
  const [insightsData, setInsightsData] = useState(null);
  const [loading, setLoading]           = useState(false);

  // Bumped every successful fetch so charts forcibly re-mount.
  const [fetchNonce, setFetchNonce] = useState(0);

  const reportRef = useRef(null);

  // ------------------- central period param builder ----------------------
  const buildParams = useCallback(() => {
    if (periodType === 'custom') {
      return { start_date: customStart, end_date: customEnd };
    }
    if (periodType === 'monthly') {
      return { period_type: 'monthly', month: monthYear };
    }
    if (periodType === 'daily') {
      return { period_type: 'daily', date: dayDate };
    }
    // weekly (default)
    return { period_type: 'weekly', date: weekDate };
  }, [periodType, weekDate, monthYear, dayDate, customStart, customEnd]);

  // ---------------------- fetchers ---------------------------------------
  const fetchLoanData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financialAPI.getLoanReport(buildParams());
      setLoanData(res.data);
      setFetchNonce((n) => n + 1);
    } catch (e) {
      console.error(e);
      showToast.error('Failed to load loan report');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const fetchCompanyData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financialAPI.getCompanyReport(buildParams());
      setCompanyData(res.data);
      setFetchNonce((n) => n + 1);
    } catch (e) {
      console.error(e);
      showToast.error('Failed to load company report');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await financialAPI.getInsights(buildParams());
      setInsightsData(res.data);
      setFetchNonce((n) => n + 1);
    } catch (e) {
      console.error(e);
      showToast.error('Failed to load insights');
    }
  }, [buildParams]);

  // React to filter / tab changes
  useEffect(() => {
    if (activeTab === 'loan') fetchLoanData();
    else if (activeTab === 'company') fetchCompanyData();
    else if (activeTab === 'insights') fetchInsights();
  }, [activeTab, buildParams, fetchLoanData, fetchCompanyData, fetchInsights]);

  // ---------------------- period label -----------------------------------
  const periodLabel = useMemo(() => {
    const fromApi =
      (activeTab === 'loan' ? loanData?.period?.label : companyData?.period?.label) ||
      insightsData?.period?.label;
    if (fromApi) return fromApi;

    if (periodType === 'monthly') {
      const [y, m] = monthYear.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      });
    }
    if (periodType === 'daily') {
      return new Date(dayDate).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
    }
    if (periodType === 'custom') {
      return `${new Date(customStart).toLocaleDateString('en-GB')} – ${new Date(
        customEnd
      ).toLocaleDateString('en-GB')}`;
    }
    return `Week of ${new Date(weekDate).toLocaleDateString('en-GB')}`;
  }, [
    activeTab, loanData, companyData, insightsData,
    periodType, monthYear, dayDate, customStart, customEnd, weekDate,
  ]);

  // ---------------------- PDF generation ---------------------------------
  const generateReportPDF = async (preview = true) => {
    const payload = activeTab === 'loan' ? loanData : companyData;
    if (!payload) {
      showToast.error('No data to generate report');
      return;
    }
    if (!reportRef.current) return;

    try {
      const chartEls = reportRef.current.querySelectorAll('.chart-wrapper');
      const chartImages = [];
      for (const el of Array.from(chartEls)) {
        const canvas = await html2canvas(el, {
          scale: 3,
          useCORS: true,
          logging: false,
        });
        chartImages.push({
          data: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
        });
      }

      const result = await generateFinancialReportPDF(
        payload,
        payload.period?.label || periodLabel,
        chartImages,
        activeTab === 'loan' ? 'loan' : 'company',
        preview
      );

      if (preview && result) {
        const url = URL.createObjectURL(result);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast.success('Report opened in preview');
      } else if (!preview) {
        showToast.success('Report downloaded');
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast.error('Failed to generate PDF');
    }
  };

  // ======================================================================
  //                        LOAN REPORT RENDER
  // ======================================================================
  const renderLoanContent = () => {
    if (!loanData) return <div className="text-center py-4">No data</div>;
    const data = loanData;

    // Signature changes whenever any value or the period changes.
    const chartKey = `loan-${chartType}-${dataSignature({
      m: data.total_money_lent,
      p: data.principal_collected,
      i: data.interest_collected,
      op: data.outstanding_principal,
      oi: data.outstanding_interest,
      c: data.total_claimed_amount,
      w: data.total_waived_amount,
      bd: data.total_bad_debt,
      period: data.period?.label,
      nonce: fetchNonce,
    })}`;

    const chartLabels = [
      'Money Lent',
      'Principal Collected',
      'Interest Collected',
      'Outstanding Principal',
      'Outstanding Interest',
      'Total Claimed',
      'Total Waived',
      'Bad Debt',
    ];
    const chartValues = [
      data.total_money_lent,
      data.principal_collected,
      data.interest_collected,
      data.outstanding_principal,
      data.outstanding_interest,
      data.total_claimed_amount,
      data.total_waived_amount,
      data.total_bad_debt,
    ];
    const chartColors = [
      '#1e40af', '#10b981', '#f59e0b', '#ef4444',
      '#8b5cf6', '#ec4899', '#f97316', '#6b7280',
    ];

    // Only chart the categories that are non-zero AND relevant to this period.
    // Flows (lent/collected/waived/claimed) change per-period; stocks
    // (outstanding/bad debt) are as-of the period end.
    const visibleLabels = chartLabels;
    const visibleValues = chartValues;
    const visibleColors = chartColors;

    let ChartComponent = Bar;
    let chartProps;

    if (chartType === 'pie') {
      ChartComponent = Pie;
      chartProps = {
        data: {
          labels: visibleLabels,
          datasets: [{
            data: visibleValues,
            backgroundColor: visibleColors,
            borderColor: '#fff',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            title: {
              display: true,
              text: `Loan Report — ${periodLabel}`,
              font: { size: 14, weight: '600' },
            },
            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } },
          },
        },
      };
    } else if (chartType === 'line') {
      ChartComponent = Line;
      chartProps = {
        data: {
          labels: visibleLabels,
          datasets: [{
            label: 'Amount (KES)',
            data: visibleValues,
            borderColor: '#1e40af',
            backgroundColor: 'rgba(30, 64, 175, 0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: visibleColors,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: `Loan Report — ${periodLabel}`,
              font: { size: 14, weight: '600' },
            },
            tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => formatCurrency(v) } },
          },
        },
      };
    } else {
      ChartComponent = Bar;
      chartProps = {
        data: {
          labels: visibleLabels,
          datasets: [{
            label: 'Amount (KES)',
            data: visibleValues,
            backgroundColor: visibleColors,
            borderColor: visibleColors,
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: `Loan Report — ${periodLabel}`,
              font: { size: 14, weight: '600' },
            },
            tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => formatCurrency(v) } },
          },
        },
      };
    }

    return (
      <div ref={reportRef}>
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
                <h4 className="card-title">{Number(data.loan_recovery_rate || 0).toFixed(2)}%</h4>
              </div>
            </div>
          </div>
        </div>

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
          <div className="col-6 col-md-3">
            <div className="card border-danger">
              <div className="card-body">
                <h6 className="card-subtitle text-danger">Bad Debt</h6>
                <h4 className="card-title">{formatCurrency(data.total_bad_debt)}</h4>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="chart-wrapper d-flex justify-content-center">
              <div style={{ width: '100%', maxWidth: '900px', height: '460px' }}>
                <ChartComponent key={chartKey} {...chartProps} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ======================================================================
  //                       COMPANY REPORT RENDER
  // ======================================================================
  const renderCompanyContent = () => {
    if (!companyData) return <div className="text-center py-4">No data</div>;
    const data = companyData;

    const moneyInCategories = [
      { label: 'Principal Payments',   value: data.money_in.principal_payments    || 0 },
      { label: 'Interest Payments',    value: data.money_in.interest_payments     || 0 },
      { label: 'Other Loan Payments',  value: data.money_in.other_loan_payments   || 0 },
      { label: 'Claims / Recoveries',  value: data.money_in.claims_recoveries     || 0 },
      { label: 'Other Income',         value: data.money_in.other_income          || 0 },
    ];

    const moneyOutCategories = [
      { label: 'Loan Disbursements',   value: data.money_out.loan_disbursements   || 0 },
      { label: 'Loan Top-ups',         value: data.money_out.loan_topups          || 0 },
      { label: 'Petty Cash',           value: data.money_out.petty_cash           || 0 },
      { label: 'Operational',          value: data.money_out.operational          || 0 },
      { label: 'Salaries',             value: data.money_out.salaries             || 0 },
      { label: 'Salary Advances',      value: data.money_out.salary_advances      || 0 },
      { label: 'Investor Returns',     value: data.money_out.investor_returns     || 0 },
    ];

    const buildChartProps = (labels, values, colors, title) => {
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: title,
            font: { size: 14, weight: '600' },
          },
          tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => formatCurrency(v) } },
        },
      };

      if (chartType === 'pie') {
        return {
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: colors,
              borderColor: '#fff',
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              title: {
                display: true,
                text: title,
                font: { size: 14, weight: '600' },
              },
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
            labels,
            datasets: [{
              label: 'Amount (KES)',
              data: values,
              borderColor: '#1e40af',
              backgroundColor: 'rgba(30, 64, 175, 0.1)',
              fill: true,
              tension: 0.4,
              pointBackgroundColor: colors,
            }],
          },
          options: commonOptions,
        };
      }

      return {
        data: {
          labels,
          datasets: [{
            label: 'Amount (KES)',
            data: values,
            backgroundColor: colors,
            borderColor: colors,
            borderWidth: 1,
          }],
        },
        options: commonOptions,
      };
    };

    const inColors  = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#bbf7d0'];
    const outColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca',
                       '#fecdd3', '#fde2e2', '#fee2e2'];

    const inProps  = buildChartProps(
      moneyInCategories.map((c) => c.label),
      moneyInCategories.map((c) => c.value),
      inColors,
      `Money In — ${periodLabel}`
    );
    const outProps = buildChartProps(
      moneyOutCategories.map((c) => c.label),
      moneyOutCategories.map((c) => c.value),
      outColors,
      `Money Out — ${periodLabel}`
    );

    const ChartComponent = chartType === 'pie' ? Pie : chartType === 'line' ? Line : Bar;

    // Re-mount both charts whenever the dataset or period changes.
    const inKey = `in-${chartType}-${dataSignature({
      values: moneyInCategories.map((c) => c.value),
      period: periodLabel,
      nonce: fetchNonce,
    })}`;
    const outKey = `out-${chartType}-${dataSignature({
      values: moneyOutCategories.map((c) => c.value),
      period: periodLabel,
      nonce: fetchNonce,
    })}`;

    const netCashFlow = Number(data.net_cash_flow ?? 0);
    const profitLoss  = Number(data.profit_loss  ?? 0);

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
                <h6 className="card-subtitle">Net Cash Flow</h6>
                <h4 className="card-title">{formatCurrency(netCashFlow)}</h4>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card bg-warning text-dark">
              <div className="card-body">
                <h6 className="card-subtitle">Profit / (Loss)</h6>
                <h4 className="card-title">{formatCurrency(profitLoss)}</h4>
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
                <div className="chart-wrapper" style={{ height: '380px' }}>
                  <ChartComponent key={inKey} {...inProps} />
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
                <div className="chart-wrapper" style={{ height: '380px' }}>
                  <ChartComponent key={outKey} {...outProps} />
                </div>
              </div>
            </div>
          </div>
        </div>

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
                  <li className="d-flex justify-content-between border-top pt-2 mt-2">
                    <span className="fw-bold text-success">TOTAL MONEY IN</span>
                    <span className="fw-bold text-success">{formatCurrency(data.money_in.total)}</span>
                  </li>
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
                  <li className="d-flex justify-content-between border-top pt-2 mt-2">
                    <span className="fw-bold text-danger">TOTAL MONEY OUT</span>
                    <span className="fw-bold text-danger">{formatCurrency(data.money_out.total)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ======================================================================
  //                          INSIGHTS RENDER
  // ======================================================================
  const renderInsights = () => {
    if (!insightsData) return <div className="text-center py-4">No insights</div>;
    const prettify = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const formatValue = (k, v) => {
      if (typeof v === 'number' && /money|amount|cash|profit|loss/i.test(k)) {
        return formatCurrency(v);
      }
      if (typeof v === 'object' && v !== null) return JSON.stringify(v);
      return String(v);
    };
    return (
      <div className="card">
        <div className="card-body">
          <ul className="list-group list-group-flush">
            {Object.entries(insightsData)
              .filter(([k]) => k !== 'period')
              .map(([key, value]) => (
                <li key={key} className="list-group-item d-flex justify-content-between align-items-center">
                  <span>{prettify(key)}</span>
                  <span className="badge bg-primary rounded-pill">{formatValue(key, value)}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    );
  };

  // ======================================================================
  //                             MAIN RENDER
  // ======================================================================
  return (
    <div className="financial-reports">
      <ul className="nav nav-tabs mb-4">
        {[
          { key: 'loan', label: 'Loan Report' },
          { key: 'company', label: 'Company Report' },
          { key: 'insights', label: 'Insights' },
        ].map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              className={`nav-link ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="alert alert-info py-2 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center">
          <i className="fas fa-calendar-alt me-2"></i>
          <strong className="me-1">
            {periodType === 'weekly'  ? 'Week:'  :
             periodType === 'monthly' ? 'Month:' :
             periodType === 'daily'   ? 'Day:'   : 'Range:'}
          </strong>
          <span>{periodLabel}</span>
        </div>
        {loading && (
          <span className="text-muted small">
            <span className="spinner-border spinner-border-sm me-1" role="status" />
            Refreshing…
          </span>
        )}
      </div>

      <div className="row g-3 align-items-end mb-4">
        <div className="col-12 col-md-4">
          <label className="form-label">Period</label>
          <div className="btn-group w-100 flex-wrap" role="group">
            {[
              { key: 'weekly',  label: 'Weekly'  },
              { key: 'monthly', label: 'Monthly' },
              { key: 'daily',   label: 'Daily'   },
              { key: 'custom',  label: 'Custom'  },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm ${periodType === key ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setPeriodType(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="col-12 col-md-4">
          {periodType === 'weekly' && (
            <>
              <label className="form-label">Any day in the week</label>
              <input
                type="date"
                className="form-control"
                value={weekDate}
                onChange={(e) => setWeekDate(e.target.value)}
              />
            </>
          )}
          {periodType === 'monthly' && (
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
          {periodType === 'daily' && (
            <>
              <label className="form-label">Day</label>
              <input
                type="date"
                className="form-control"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
              />
            </>
          )}
          {periodType === 'custom' && (
            <>
              <label className="form-label">Range</label>
              <div className="d-flex gap-2">
                <input
                  type="date"
                  className="form-control"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <input
                  type="date"
                  className="form-control"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="col-12 col-md-2">
          <label className="form-label">Chart Type</label>
          <div className="btn-group w-100" role="group">
            {['line', 'bar', 'pie'].map((t) => (
              <button
                key={t}
                type="button"
                className={`btn btn-sm ${chartType === t ? 'btn-secondary' : 'btn-outline-secondary'}`}
                onClick={() => setChartType(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="col-12 col-md-2 d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-primary flex-fill"
            onClick={() => generateReportPDF(true)}
            disabled={loading || activeTab === 'insights'}
          >
            <i className="fas fa-eye me-1"></i> Preview
          </button>
          <button
            type="button"
            className="btn btn-primary flex-fill"
            onClick={() => generateReportPDF(false)}
            disabled={loading || activeTab === 'insights'}
          >
            <i className="fas fa-download me-1"></i> Download
          </button>
        </div>
      </div>

      {loading && !loanData && !companyData && !insightsData ? (
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