// CompanyGallery.jsx
"use client"

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";

const CompanyGallery = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDetailView, setIsDetailView] = useState(false);
  const galleryRef = useRef(null);
  
  // Generate all 127 grand opening ceremony images
  const generateGrandOpeningImages = () => {
    const images = [];
    for (let i = 1; i <= 127; i++) {
      images.push({
        id: i,
        src: `/gallery/M.S (${i} of 127).JPG`,
        thumbnail: `/gallery/M.S (${i} of 127).JPG`,
        title: "Grand Opening Ceremony",
        description: "Official grand opening of Nagolie Enterprises graced by P.s Justice Hon. Judith Pareno",
        category: "events",
        date: "15-01-2026",
      });
    }
    return images;
  };

  // Other gallery images (placeholder for other categories)
  const otherImages = [
  ];

  // Combine all images
  const galleryImages = [...generateGrandOpeningImages(), ...otherImages];

  // Filter categories
  const categories = [
    { id: "all", name: "All Photos", count: galleryImages.length },
    { id: "events", name: "Grand Opening Ceremony", count: 127 },
    { id: "operations", name: "Operations", count: 0 },
    { id: "services", name: "Services", count: 0 },
    { id: "team", name: "Team", count: 0 },
  ];

  const [activeCategory, setActiveCategory] = useState("all");
  const [filteredImages, setFilteredImages] = useState(galleryImages);
  const [isLoading, setIsLoading] = useState(true);

  const handleSeeAllPhotos = () => {
    // First close the modal
    handleCloseModal();    
    // Then change the category back to "all"
    setActiveCategory("all");    
    // Scroll to gallery section
    if (galleryRef.current) {
      setTimeout(() => {
        galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
    
  };

  useEffect(() => {
    if (activeCategory === "all") {
      setFilteredImages(galleryImages);
    } else {
      setFilteredImages(galleryImages.filter(img => img.category === activeCategory));
    }
    // Simulate loading images
    setTimeout(() => setIsLoading(false), 500);
  }, [activeCategory]);

  const handleImageClick = (image, index) => {
    setSelectedImage(image);
    setCurrentIndex(index);
    setIsDetailView(true);
    document.body.style.overflow = "hidden";
  };

  const handleCloseModal = () => {
    setSelectedImage(null);
    setIsDetailView(false);
    document.body.style.overflow = "auto";
  };

  const goToNext = () => {
    const newIndex = (currentIndex + 1) % filteredImages.length;
    setCurrentIndex(newIndex);
    setSelectedImage(filteredImages[newIndex]);
  };

  const goToPrev = () => {
    const newIndex = (currentIndex - 1 + filteredImages.length) % filteredImages.length;
    setCurrentIndex(newIndex);
    setSelectedImage(filteredImages[newIndex]);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedImage) return;
      
      if (e.key === 'Escape') {
        handleCloseModal();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, currentIndex]);

  // Function to simulate the portfolio slider's transform effect
  const getTransformStyle = (index) => {
    if (!selectedImage) return {};
    
    const selectedIndex = filteredImages.findIndex(img => img.id === selectedImage.id);
    const distance = index - selectedIndex;
    
    if (distance === 0) {
      return { 
        transform: 'translateX(0) scale(1)', 
        zIndex: 10, 
        filter: 'blur(0)',
        opacity: 1 
      };
    } else if (distance === 1) {
      return { 
        transform: 'translateX(50%) scale(0.8)', 
        zIndex: 9, 
        filter: 'blur(5px)',
        opacity: 0.8 
      };
    } else if (distance === -1) {
      return { 
        transform: 'translateX(-100%) scale(1.5)', 
        zIndex: 11, 
        filter: 'blur(30px)',
        opacity: 0 
      };
    } else if (distance === 2) {
      return { 
        transform: 'translateX(90%) scale(0.5)', 
        zIndex: 8, 
        filter: 'blur(15px)',
        opacity: 0.6 
      };
    } else if (distance === -2) {
      return { 
        transform: 'translateX(-120%) scale(0.3)', 
        zIndex: 7, 
        filter: 'blur(25px)',
        opacity: 0 
      };
    }
    
    return { opacity: 0, pointerEvents: 'none' };
  };

  if (isLoading) {
    return (
      <div className="company-gallery-page">
        <Navbar />
        <div className="d-flex justify-content-center align-items-center" style={{ height: 'calc(100vh - 80px)' }}>
          <div className="text-center">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-3">Loading gallery...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="company-gallery-page">
      <Navbar />      
      {/* Hero Section */}      
      <section className="gallery-hero-section">
        <div className="container">
          <div className="row">
            <div className="col-lg-8 mx-auto text-center">
              <h1 className="display-5 fw-bold mb-3">Company Gallery</h1>
              <p className="lead mb-4">
                A visual journey through our company's milestones, events, and daily operations. 
                See behind the scenes of Nagolie Enterprises.
              </p>              
            </div>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="category-filter py-4">
        <div className="container">
          <div className="row">
            <div className="col-12">
              <div className="d-flex flex-wrap justify-content-center gap-2">
                {categories.map(category => (
                  <button
                    key={category.id}
                    className={`btn ${activeCategory === category.id ? 'btn-primary' : 'btn-outline-primary'} rounded-pill px-4`}
                    onClick={() => {
                      setActiveCategory(category.id);
                      setIsLoading(true);
                    }}
                  >
                    {category.name} <span className="badge bg-white text-primary ms-2">{category.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="gallery-grid-section py-5">
        <div className="container">
          <div className="row g-4" ref={galleryRef}>
            {filteredImages.map((image, index) => (
              <div 
                key={image.id} 
                className={`gallery-item ${image.category} ${index % 6 === 0 ? 'wide' : ''} ${index % 7 === 0 ? 'tall' : ''}`}
                onClick={() => handleImageClick(image, index)}
              >
                <div className="gallery-item-inner">
                  <div className="gallery-image-wrapper">
                    <img 
                      src={image.thumbnail} 
                      alt={`${image.title} - Image ${image.id}`}
                      className="gallery-image"
                      loading="lazy"
                      onError={(e) => {
                        e.target.src = '/placeholder-image.jpg';
                      }}
                    />
                    <div className="gallery-overlay">
                      <div className="overlay-content">
                        <h5 className="image-title">{image.title}</h5>
                        <p className="image-description">{image.description}</p>
                        <div className="image-meta">
                          <span className="badge bg-light text-dark me-2">
                            <i className="fas fa-images me-1"></i>
                            Image {image.id}
                          </span>
                          <span className="badge bg-light text-dark me-2">
                            <i className="fas fa-images me-1"></i>
                           {image.date}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio-style Slider Modal */}
      {selectedImage && (
        <div className={`portfolio-slider-modal ${isDetailView ? 'show-detail' : ''}`}>
          <div className="slider-container">
            {/* Close Button */}
            <button className="slider-close-btn" onClick={handleCloseModal}>
              <i className="fas fa-times"></i>
            </button>

            {/* Navigation Arrows */}
            <button className="slider-nav prev" onClick={goToPrev}>
              <i className="fas fa-chevron-left"></i>
            </button>
            <button className="slider-nav next" onClick={goToNext}>
              <i className="fas fa-chevron-right"></i>
            </button>

            {/* Image List */}
            <div className="image-list">
              {filteredImages.map((image, index) => (
                <div 
                  key={image.id}
                  className={`image-item ${index === currentIndex ? 'active' : ''}`}
                  style={getTransformStyle(index)}
                >
                  {index === currentIndex ? (
                    <>
                      {/* Center Image */}
                      <div className="image-center">
                        <img 
                          src={image.src} 
                          alt={image.title}
                          className="slider-main-image"
                          onError={(e) => {
                            e.target.src = '/placeholder-image.jpg';
                          }}
                        />
                      </div>

                      {/* Right Side Content */}
                      <div className="right-content">
                        <div className="content-wrapper">
                          <div className="intro-topic">{image.title}</div>
                          <div className="intro-description">
                            {image.description}
                          </div>
                          
                          {/* Image Counter */}
                          <div className="image-counter">
                            <span className="current-index">{currentIndex + 1}</span>
                            <span className="separator">/</span>
                            <span className="total-count">{filteredImages.length}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    // Non-active image (for 3D effect)
                    <img 
                      src={image.thumbnail} 
                      alt={image.title}
                      className="slider-secondary-image"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* See All Back Button */}
            {isDetailView && (
              <button className="see-all-back" onClick={handleSeeAllPhotos}>
                SEE ALL PHOTOS <i className="fas fa-arrow-up-right"></i>
              </button>
            )}
          </div>
        </div>
      )}      
      <Footer />
    </div>
  );
};

export default CompanyGallery;