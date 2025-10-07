"use client"

import { useState, useEffect } from "react"
import { paymentAPI } from "../../services/api"

function PaymentStatus({ paymentId }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await paymentAPI.getStatus(paymentId)
        setStatus(response.data)
      } catch (error) {
        console.error("Failed to fetch payment status:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [paymentId])

  if (loading) {
    return <div className="text-center">Loading payment status...</div>
  }

  if (!status) {
    return <div className="text-center text-danger">Failed to load payment status</div>
  }

  const statusColors = {
    pending: "warning",
    completed: "success",
    failed: "danger",
    cancelled: "secondary",
  }

  return (
    <div className={`alert alert-${statusColors[status.status]}`}>
      <h5>Payment Status: {status.status.toUpperCase()}</h5>
      {status.mpesa_receipt_number && <p>Receipt: {status.mpesa_receipt_number}</p>}
      {status.result_desc && <p>{status.result_desc}</p>}
    </div>
  )
}

export default PaymentStatus
