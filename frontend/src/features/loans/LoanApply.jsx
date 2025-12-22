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
    email: "", // ADDED: Missing email field
    loanAmount: "",
    livestockType: "",
    count: "", // CHANGED: from livestockCount to count (matches backend)
    estimatedValue: "",
    location: "", // CHANGED: from livestockLocation to location (matches backend)
    notes: "", // CHANGED: from additionalInfo to notes (matches backend)
    agreeTerms: false,
  })

  const [photos, setPhotos] = useState([]) // CHANGED: from livestockPhotos to photos

  const [showTermsModal, setShowTermsModal] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Mobile-responsive select style helper
  const getSelectStyle = () => ({
    width: '100%',
    fontSize: window.innerWidth < 768 ? '14px' : '16px', // Smaller font on mobile
    padding: window.innerWidth < 768 ? '8px 36px 8px 8px' : '12px 40px 12px 12px', // Reduced padding on mobile
    borderRadius: '8px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: window.innerWidth < 768 ? 'right 8px center' : 'right 12px center', // Adjust arrow position
    backgroundSize: window.innerWidth < 768 ? '12px' : '16px', // Smaller arrow on mobile
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    })
  }

  // FIXED: Convert files to base64 for backend
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    setUploading(true)
    
    try {
      const photoPromises = files.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.readAsDataURL(file)
        })
      })
      
      const base64Photos = await Promise.all(photoPromises)
      setPhotos(base64Photos)
      console.log("Converted photos to base64:", base64Photos.length)
    } catch (error) {
      console.error("Error converting photos:", error)
      alert("Error uploading photos. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.agreeTerms) {
      alert("Please agree to the terms and conditions before submitting your application.");
      return;
    }

    if (photos.length === 0) {
      alert("Please upload at least one photo of your livestock.");
      return;
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
    };

    console.log("Submitting data:", submissionData);

    // Call parent submit function
    onSubmit(submissionData);

    // ✅ Reset the form after successful submission
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
    });

    // Clear photo uploads
    setPhotos([]);  
   
  };


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
            {/* ADDED: Email field */}
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
              style={getSelectStyle()}
              >         
              <option value="">Select livestock type</option>
              <option value="cattle">Cattle</option>
              <option value="goats">Goats</option>
              <option value="sheep">Sheep</option>
              <option value="chickens">Chickens</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6">
            {/* CHANGED: name from livestockCount to count */}
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

        <div className="mb-3">
          {/* CHANGED: name from livestockLocation to location */}
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
            {uploading ? "Uploading photos..." : `Upload clear photos of your livestock (${photos.length} photos selected)`}
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
            {uploading ? "Uploading..." : "Submit Application"}
          </Button>
        </div>
      </form>

      <TermsModal isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} />
    </>
  )
}

export default LoanApply