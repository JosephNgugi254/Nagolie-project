"use client"

import ImageCarousel from "./ImageCarousel"
import { formatCurrency } from "../../utils/format" // You'll need to create this utility

function LivestockGallery({ livestock, onShare, showShareButton, investorView }) {
  const handleShare = (item) => {
    if (onShare) {
      onShare(item.id, `Check out this livestock: ${item.title}`)
    }
  }

  return (
    <div className="row" id="livestock-gallery">
      {livestock.map((item) => (
        <div key={item.id} className="col-md-4 mb-4">
          <div className="card h-100">
            <ImageCarousel 
              images={item.images} 
              title={item.title}
              height="200px"
            />
            <div className="card-body d-flex flex-column">
              <h5 className="card-title">{item.title}</h5>
              <p className="card-text flex-grow-1">{item.description || 'Available for purchase'}</p>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="h5 text-primary">{formatCurrency(item.price)}</span>
                <span className={`badge ${
                  item.daysRemaining > 1 ? 'bg-warning' : 
                  item.daysRemaining === 1 ? 'bg-info' : 
                  'bg-success'
                }`}>
                  {item.availableInfo}
                </span>
              </div>
              {showShareButton && (
                <button 
                  className="btn btn-outline-info btn-sm"
                  onClick={() => handleShare(item)}
                >
                  <i className="fas fa-share-alt me-1"></i> Share
                </button>
              )}
            </div>
            <div className="card-footer">
              <small className="text-muted">
                <i className="fas fa-map-marker-alt me-1"></i>
                {item.location || 'Isinya, Kajiado'}
              </small>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default LivestockGallery