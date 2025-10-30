import { Helmet } from 'react-helmet-async'

const SEO = ({ 
  title = "Nagolie - Livestock Backed Lending Solutions in Kajiado, Kenya",
  description = "Get affordable livestock loans and agricultural financing in Kajiado County. Cattle financing, livestock collateral loans, and farm credit solutions.",
  keywords = "livestock loans Kenya, agricultural financing Kajiado, cattle loans Kenya, livestock collateral, farm loans Kajiado, Nagolie lending",
  canonical = "https://nagolie.com"
}) => {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={canonical} />
      
      {/* Open Graph tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content="Nagolie" />
      
      {/* Twitter Card tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  )
}

export default SEO