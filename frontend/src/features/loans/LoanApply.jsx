"use client"

import { useState } from "react"
import FormInput from "../../components/common/FormInput"
import Button from "../../components/common/Button"
import TermsModal from "../../components/common/TermsModal"
import imageCompression from 'browser-image-compression'

function LoanApply({ onSubmit }) {
  const [formData, setFormData] = useState({
    fullName: "",
    phoneNumber: "",
    idNumber: "",
    email: "",
    loanAmount: "",
    livestockType: "", 
    count: "",
    estimatedValue: "",
    location: "",
    notes: "",
    agreeTerms: false,
    repaymentPlan: "weekly",   // default to weekly
  })

  // New state for main dropdown selection
  const [mainLivestockType, setMainLivestockType] = useState("")
  const [photos, setPhotos] = useState([])
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [uploading, setUploading] = useState(false)

  const getSelectStyle = () => ({
    width: '100%',
    fontSize: window.innerWidth < 768 ? '14px' : '16px',
    padding: window.innerWidth < 768 ? '8px 36px 8px 8px' : '12px 40px 12px 12px',
    borderRadius: '8px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: window.innerWidth < 768 ? 'right 8px center' : 'right 12px center',
    backgroundSize: window.innerWidth < 768 ? '12px' : '16px',
  })

  // Handle main dropdown change
  const handleMainTypeChange = (e) => {
    const value = e.target.value
    setMainLivestockType(value)

    if (value !== "other") {
      setFormData({ ...formData, livestockType: value })
    } else {
      setFormData({ ...formData, livestockType: "" })
    }
  }

  // Handle combination selection
  const handleCombinationChange = (e) => {
    const value = e.target.value
    setFormData({ ...formData, livestockType: value })
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    })
  }

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setUploading(true)

    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      }

      const compressedFiles = await Promise.all(
        files.map(file => imageCompression(file, options))
      )

      const photoPromises = compressedFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.readAsDataURL(file)
        })
      })

      const base64Photos = await Promise.all(photoPromises)
      setPhotos(base64Photos)
      console.log("Compressed and converted photos to base64:", base64Photos.length)
    } catch (error) {
      console.error("Error processing photos:", error)
      alert("Error uploading photos. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!formData.agreeTerms) {
      alert("Please agree to the terms and conditions before submitting your application.")
      return
    }

    if (photos.length === 0) {
      alert("Please upload at least one photo of your livestock.")
      return
    }

    if (mainLivestockType === "other" && !formData.livestockType) {
      alert("Please select a livestock combination.")
      return
    }

    const submissionData = {
      fullName: formData.fullName,
      phoneNumber: formData.phoneNumber,
      idNumber: formData.idNumber,
      email: formData.email,
      loanAmount: formData.loanAmount,
      livestockType: formData.livestockType,
      count: formData.count,
      estimatedValue: formData.estimatedValue,
      location: formData.location,
      notes: formData.notes,
      photos: photos,
      repaymentPlan: formData.repaymentPlan,
    }

    console.log("Submitting data:", submissionData)

    onSubmit(submissionData)

    // Reset form
    setFormData({
      fullName: "",
      phoneNumber: "",
      idNumber: "",
      email: "",
      loanAmount: "",
      livestockType: "",
      count: "",
      estimatedValue: "",
      location: "",
      notes: "",
      agreeTerms: false,
      repaymentPlan: "weekly",
    })
    setMainLivestockType("")
    setPhotos([])
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-md-6">
            <FormInput 
              label="Full Name" 
              name="fullName" 
              value={formData.fullName} 
              onChange={handleChange} 
              required 
            />
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
            <FormInput 
              label="ID Number" 
              name="idNumber" 
              value={formData.idNumber} 
              onChange={handleChange} 
              required 
            />
          </div>
          <div className="col-md-6">
            <FormInput
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="example@email.com (optional)"
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6">
            <FormInput
              label="Amount (KSh)"
              name="loanAmount"
              type="number"
              value={formData.loanAmount}
              onChange={handleChange}
              placeholder="Enter desired amount"
              min="1000"
              max="1000000"
              required
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="mainLivestockType" className="form-label">
              Livestock Type <span className="text-danger">*</span>
            </label>
            <select
              className="form-control"
              id="mainLivestockType"
              name="mainLivestockType"
              value={mainLivestockType}
              onChange={handleMainTypeChange}
              required
              style={getSelectStyle()}
            >         
              <option value="">Select livestock type</option>
              <option value="cattle">Cattle</option>
              <option value="goats">Goats</option>
              <option value="sheep">Sheep</option>
              <option value="chickens">Chickens</option>
              <option value="other">Other (combination)</option>
            </select>

            {mainLivestockType === "other" && (
              <div className="mt-3">
                <label htmlFor="combination" className="form-label">
                  Select Combination <span className="text-danger">*</span>
                </label>
                <select
                  className="form-control"
                  id="combination"
                  value={formData.livestockType}
                  onChange={handleCombinationChange}
                  required
                  style={getSelectStyle()}
                >
                  <option value="">-- Choose a combination --</option>
                  <option value="cattle & sheep">Cattle & Sheep</option>
                  <option value="cattle & goats">Cattle & Goats</option>
                  <option value="goats & sheep">Goats & Sheep</option>
                  <option value="cattle, goats & sheep">Cattle, Goats & Sheep</option>
                  <option value="cattle & chickens">Cattle & Chickens</option>
                  <option value="goats & chickens">Goats & Chickens</option>
                  <option value="sheep & chickens">Sheep & Chickens</option>
                  <option value="cattle, goats & chickens">Cattle, Goats & Chickens</option>
                  <option value="goats, sheep & chickens">Goats, Sheep & Chickens</option>
                  <option value="cattle, sheep & chickens">Cattle, Sheep & Chickens</option>
                  <option value="cattle, goats, sheep & chickens">All types</option>
                </select>
                <small className="form-text text-muted">
                  Choose the combination that matches your collateral.
                </small>
              </div>
            )}
          </div>
        </div>

        <div className="row">
          <div className="col-md-6">
            <FormInput
              label="Number of Livestock"
              name="count"
              type="number"
              value={formData.count}
              onChange={handleChange}
              placeholder="Enter specific Livestock"
              min="1"
              required
            />
          </div>
          <div className="col-md-6">
            <FormInput
              label="Estimated Value (KSh)"
              name="estimatedValue"
              type="number"
              placeholder="Enter estimate value of your livestock"
              value={formData.estimatedValue}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        {/* New Interest / Repayment Plan Section */}
        <div className="mb-3">
          <label className="form-label fw-bold">
            Interest Plan <span className="text-danger">*</span>
          </label>
          <div className="d-flex gap-4">
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="repaymentPlan"
                id="planWeekly"
                value="weekly"
                checked={formData.repaymentPlan === "weekly"}
                onChange={handleChange}
                required
              />
              <label className="form-check-label" htmlFor="planWeekly">
                Weekly Plan – 30% interest, repay within 7 days
              </label>
            </div>
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="repaymentPlan"
                id="planDaily"
                value="daily"
                checked={formData.repaymentPlan === "daily"}
                onChange={handleChange}
              />
              <label className="form-check-label" htmlFor="planDaily">
                Daily Plan – 4.5% interest per day, due in 14 days (max)
              </label>
            </div>
          </div>
          <small className="text-muted">
            {formData.repaymentPlan === "weekly"
              ? "Interest: 30% of principal. Loan due in 7 days."
              : "Interest: 4.5% per day for up to 14 days. Loan due in 14 days."}
          </small>
        </div>

        <div className="mb-3">
          <label htmlFor="location" className="form-label">
            Location <span className="text-danger">*</span>
          </label>
          <textarea
            className="form-control"
            id="location"
            name="location"
            rows="2"
            value={formData.location}
            onChange={handleChange}
            placeholder="Provide detailed location for valuation visit"
            required
          ></textarea>          
        </div>

        <div className="mb-3">
          <label htmlFor="photos" className="form-label">
            Livestock Photos <span className="text-danger">*</span>
          </label>
          <input
            type="file"
            className="form-control"
            id="photos"
            name="photos"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            required
          />
          <small className="form-text text-muted">
            {uploading ? "Compressing and uploading photos..." : `Upload clear photos of your livestock (${photos.length} photos selected)`}
          </small>
          {photos.length > 0 && (
            <div className="mt-2">
              <small className="text-success">
                <i className="fas fa-check me-1"></i>
                {photos.length} photo(s) ready for upload
              </small>
            </div>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="notes" className="form-label">
            Additional Information
          </label>
          <textarea
            className="form-control"
            id="notes"
            name="notes"
            rows="3"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Any additional information (optional)"
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
          <Button 
            type="submit" 
            size="lg" 
            className="px-5"
            disabled={uploading}
          >
            {uploading ? "Processing..." : "Submit Application"}
          </Button>
        </div>
      </form>

      <TermsModal isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} />
    </>
  )
}

export default LoanApply