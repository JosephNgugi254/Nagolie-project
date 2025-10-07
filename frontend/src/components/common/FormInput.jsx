"use client"

function FormInput({ label, type = "text", name, value, onChange, required = false, error, ...props }) {
  return (
    <div className="mb-3">
      {label && (
        <label htmlFor={name} className="form-label">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <input
        type={type}
        className={`form-control ${error ? "is-invalid" : ""}`}
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        {...props}
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  )
}

export default FormInput
