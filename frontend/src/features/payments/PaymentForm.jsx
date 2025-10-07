"use client"

import { useState } from "react"
import { paymentAPI } from "../../services/api"
import FormInput from "../../components/common/FormInput"
import Button from "../../components/common/Button"

function PaymentForm({ loanId, clientName, balance, onSuccess }) {
  const [formData, setFormData] = useState({
    phone_number: "",
    amount: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await paymentAPI.initiateSTK({
        loan_id: loanId,
        phone_number: formData.phone_number,
        amount: Number.parseFloat(formData.amount),
      })

      if (response.data.success) {
        alert(response.data.message)
        onSuccess()
      } else {
        setError(response.data.error)
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to initiate payment")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="mb-3">
        <label className="form-label">Client Name</label>
        <input type="text" className="form-control" value={clientName} readOnly />
      </div>

      <div className="mb-3">
        <label className="form-label">Current Balance</label>
        <input type="text" className="form-control" value={`KSh ${balance}`} readOnly />
      </div>

      <FormInput
        label="Phone Number"
        name="phone_number"
        value={formData.phone_number}
        onChange={handleChange}
        placeholder="254712345678"
        required
      />

      <FormInput
        label="Payment Amount (KSh)"
        type="number"
        name="amount"
        value={formData.amount}
        onChange={handleChange}
        min="1"
        max={balance}
        required
      />

      <Button type="submit" className="w-100" disabled={loading}>
        {loading ? "Processing..." : "Send M-Pesa Prompt"}
      </Button>
    </form>
  )
}

export default PaymentForm
