"use client"

function Button({ children, variant = "primary", size = "md", onClick, type = "button", className = "", ...props }) {
  const sizeClass = size === "lg" ? "btn-lg" : size === "sm" ? "btn-sm" : ""
  const variantClass = variant === "outline" ? "btn-outline-primary" : `btn-${variant}`

  return (
    <button type={type} className={`btn ${variantClass} ${sizeClass} ${className}`} onClick={onClick} {...props}>
      {children}
    </button>
  )
}

export default Button
