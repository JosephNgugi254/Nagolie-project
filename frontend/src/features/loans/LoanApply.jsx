"use client"

import { useState } from "react"
import FormInput from "../../components/common/FormInput"
import Button from "../../components/common/Button"
import TermsModal from "../../components/common/TermsModal"

function LoanApply({ onSubmit }) {
  const [formData, setFormData] = useState({
    fullName: "",
    phoneNumber: "",
    idNumber: "",
    loanAmount: "",
    livestockType: "",
    livestockCount: "",
    estimatedValue: "",
    livestockLocation: "",
    additionalInfo: "",
    agreeTerms: false,
  })

  const [livestockPhotos, setLivestockPhotos] = useState([])
  const [showTermsModal, setShowTermsModal] = useState(false)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    })
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    setLivestockPhotos(files)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!formData.agreeTerms) {
      alert("Please agree to the terms and conditions before submitting your application.")
      return
    }

    onSubmit({ ...formData, livestockPhotos })
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-md-6">
            <FormInput label="Full Name" name="fullName" value={formData.fullName} onChange={handleChange} required />
          </div>
          <div className="col-md-6">
            <FormInput
              label="Phone Number"
              name="phoneNumber"
              type="tel"
              value={formData.phoneNumber}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6">
            <FormInput label="ID Number" name="idNumber" value={formData.idNumber} onChange={handleChange} required />
          </div>
          <div className="col-md-6">
            <FormInput
              label="Loan Amount (KSh)"
              name="loanAmount"
              type="number"
              value={formData.loanAmount}
              onChange={handleChange}
              min="1000"
              max="1000000"
              required
            />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="livestockType" className="form-label">
            Livestock Type <span className="text-danger">*</span>
          </label>
          <select
            className="form-control"
            id="livestockType"
            name="livestockType"
            value={formData.livestockType}
            onChange={handleChange}
            required
          >
            <option value="">Select livestock type</option>
            <option value="cattle">Cattle</option>
            <option value="goats">Goats</option>
            <option value="sheep">Sheep</option>
            <option value="chickens">Chickens</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="row">
          <div className="col-md-6">
            <FormInput
              label="Number of Livestock"
              name="livestockCount"
              type="number"
              value={formData.livestockCount}
              onChange={handleChange}
              min="1"
              required
            />
          </div>
          <div className="col-md-6">
            <FormInput
              label="Estimated Value (KSh)"
              name="estimatedValue"
              type="number"
              value={formData.estimatedValue}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="livestockLocation" className="form-label">
            Livestock Location <span className="text-danger">*</span>
          </label>
          <textarea
            className="form-control"
            id="livestockLocation"
            name="livestockLocation"
            rows="2"
            value={formData.livestockLocation}
            onChange={handleChange}
            placeholder="Provide detailed location for valuation visit"
            required
          ></textarea>
        </div>

        <div className="mb-3">
          <label htmlFor="livestockPhotos" className="form-label">
            Livestock Photos <span className="text-danger">*</span>
          </label>
          <input
            type="file"
            className="form-control"
            id="livestockPhotos"
            name="livestockPhotos"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            required
          />
          <small className="form-text text-muted">
            Upload clear photos of your livestock (multiple photos allowed)
          </small>
        </div>

        <div className="mb-3">
          <label htmlFor="additionalInfo" className="form-label">
            Additional Information
          </label>
          <textarea
            className="form-control"
            id="additionalInfo"
            name="additionalInfo"
            rows="3"
            value={formData.additionalInfo}
            onChange={handleChange}
            placeholder="Any additional information about your livestock or loan request"
          ></textarea>
        </div>

        <div className="mb-3 form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="agreeTerms"
            name="agreeTerms"
            checked={formData.agreeTerms}
            onChange={handleChange}
            required
          />
          <label className="form-check-label" htmlFor="agreeTerms">
            I agree to the{" "}
            <span
              className="terms-link"
              style={{ color: "#007bff", cursor: "pointer", textDecoration: "none" }}
              onClick={(e) => {
                e.preventDefault()
                setShowTermsModal(true)
              }}
            >
              terms and conditions
            </span>
            .
          </label>
        </div>

        <div className="text-center">
          <Button type="submit" size="lg" className="px-5">
            Submit Application
          </Button>
        </div>
      </form>

      <TermsModal isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} />
    </>
  )
}

export default LoanApply
