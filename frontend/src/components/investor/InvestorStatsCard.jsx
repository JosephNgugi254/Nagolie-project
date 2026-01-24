function InvestorStatsCard({ title, value, icon, color = "primary", subtitle }) {
  return (
    <div className={`card stat-card bg-${color} text-white`}>
      <div className="card-body">
        <div className="d-flex justify-content-between">
          <div>
            <h6 className="card-title">{title}</h6>
            <h3>{value}</h3>
            {subtitle && <small className="opacity-75">{subtitle}</small>}
          </div>
          <i className={`fas ${icon} fa-2x opacity-75`}></i>
        </div>
      </div>
    </div>
  )
}

export default InvestorStatsCard