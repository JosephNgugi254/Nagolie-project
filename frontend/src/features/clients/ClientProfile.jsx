"use client"

import { useState, useEffect } from "react"
import { clientAPI } from "../../services/api"

function ClientProfile({ clientId }) {
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClient()
  }, [clientId])

  const fetchClient = async () => {
    try {
      const response = await clientAPI.getById(clientId)
      setClient(response.data)
    } catch (error) {
      console.error("Failed to fetch client:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-4">Loading client profile...</div>
  }

  if (!client) {
    return <div className="text-center py-4 text-danger">Client not found</div>
  }

  return (
    <div className="card">
      <div className="card-header bg-primary text-white">
        <h4 className="mb-0">{client.full_name}</h4>
      </div>
      <div className="card-body">
        <div className="row">
          <div className="col-md-6">
            <p>
              <strong>Phone:</strong> {client.phone_number}
            </p>
            <p>
              <strong>ID Number:</strong> {client.id_number}
            </p>
            <p>
              <strong>Email:</strong> {client.email || "N/A"}
            </p>
          </div>
          <div className="col-md-6">
            <p>
              <strong>Location:</strong> {client.location || "N/A"}
            </p>
            <p>
              <strong>Member Since:</strong> {new Date(client.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {client.loans && client.loans.length > 0 && (
          <div className="mt-4">
            <h5>Loans</h5>
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Balance</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {client.loans.map((loan) => (
                    <tr key={loan.id}>
                      <td>KSh {loan.total_amount}</td>
                      <td>KSh {loan.balance}</td>
                      <td>{new Date(loan.due_date).toLocaleDateString()}</td>
                      <td>
                        <span
                          className={`badge bg-${loan.status === "completed" ? "success" : loan.status === "active" ? "primary" : "danger"}`}
                        >
                          {loan.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientProfile
