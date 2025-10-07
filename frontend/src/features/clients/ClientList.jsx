"use client"

import { useState, useEffect } from "react"
import { clientAPI } from "../../services/api"
import AdminTable from "../../components/admin/AdminTable"

function ClientList({ onClientSelect }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      const response = await clientAPI.getAll()
      setClients(response.data)
    } catch (error) {
      console.error("Failed to fetch clients:", error)
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { header: "Name", field: "full_name" },
    { header: "Phone", field: "phone_number" },
    { header: "ID Number", field: "id_number" },
    { header: "Email", field: "email" },
    {
      header: "Created",
      field: "created_at",
      render: (row) => new Date(row.created_at).toLocaleDateString(),
    },
  ]

  if (loading) {
    return <div className="text-center py-4">Loading clients...</div>
  }

  return (
    <div className="card">
      <div className="card-body">
        <AdminTable columns={columns} data={clients} onRowClick={onClientSelect} />
      </div>
    </div>
  )
}

export default ClientList
