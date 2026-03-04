"use client"

import { useState, useEffect, useRef } from "react";
import api from "../services/api"; 
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";

const CompanyGallery = () => {
  const [galleryImages, setGalleryImages] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [filteredImages, setFilteredImages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedImage, setSelectedImage] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDetailView, setIsDetailView] = useState(false);
  const galleryRef = useRef(null);

  // Helper to format date as dd-mm-yyyy
  const formatDisplayDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return 'N/A';
    }
  };

  // Fetch images from API
  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const response = await api.get('/company-gallery/public');
        let images = response.data;

        // Ensure images is an array
        if (!Array.isArray(images)) {
          console.warn('API did not return an array, attempting to extract', images);
          images = images?.data || images?.items || images?.images || [];
        }
        if (!Array.isArray(images)) {
          console.error('Could not extract an array, using empty array');
          images = [];
        }

        setGalleryImages(images);
        setFilteredImages(images);

        // Build dynamic categories with counts
        const categoryCounts = {};
        images.forEach(img => {
          const cat = img.category || 'uncategorized';
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        const cats = [
          { id: 'all', name: 'All Photos', count: images.length },
          ...Object.keys(categoryCounts).map(cat => ({
            id: cat,
            name: cat.charAt(0).toUpperCase() + cat.slice(1),
            count: categoryCounts[cat]
          }))
        ];
        setCategories(cats);
      } catch (error) {
        console.error('Failed to load gallery:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, []);

  // Update filtered images when category changes
  useEffect(() => {
    if (activeCategory === "all") {
      setFilteredImages(galleryImages);
    } else {
      setFilteredImages(galleryImages.filter(img => img.category === activeCategory));
    }
  }, [activeCategory, galleryImages]);

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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedImage) return;
      if (e.key === 'Escape') handleCloseModal();
      else if (e.key === 'ArrowRight') goToNext();
      else if (e.key === 'ArrowLeft') goToPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, currentIndex, filteredImages]);

  // Transform style for slider (unchanged)
  const getTransformStyle = (index) => {
    if (!selectedImage) return {};
    const selectedIndex = filteredImages.findIndex(img => img.id === selectedImage.id);
    const distance = index - selectedIndex;
    if (distance === 0) return { transform: 'translateX(0) scale(1)', zIndex: 10, filter: 'blur(0)', opacity: 1 };
    if (distance === 1) return { transform: 'translateX(50%) scale(0.8)', zIndex: 9, filter: 'blur(5px)', opacity: 0.8 };
    if (distance === -1) return { transform: 'translateX(-100%) scale(1.5)', zIndex: 11, filter: 'blur(30px)', opacity: 0 };
    if (distance === 2) return { transform: 'translateX(90%) scale(0.5)', zIndex: 8, filter: 'blur(15px)', opacity: 0.6 };
    if (distance === -2) return { transform: 'translateX(-120%) scale(0.3)', zIndex: 7, filter: 'blur(25px)', opacity: 0 };
    return { opacity: 0, pointerEvents: 'none' };
  };

  const handleSeeAllPhotos = () => {
    handleCloseModal();
    setActiveCategory("all");
    if (galleryRef.current) {
      setTimeout(() => {
        galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  };

  if (loading) {
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

      <section className="category-filter py-4">
        <div className="container">
          <div className="row">
            <div className="col-12">
              <div className="d-flex flex-wrap justify-content-center gap-2">
                {categories.map(category => (
                  <button
                    key={category.id}
                    className={`btn ${activeCategory === category.id ? 'btn-primary' : 'btn-outline-primary'} rounded-pill px-4`}
                    onClick={() => setActiveCategory(category.id)}
                  >
                    {category.name} <span className="badge bg-white text-primary ms-2">{category.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

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
                      onError={(e) => { e.target.src = '/placeholder-image.jpg'; }}
                    />
                    <div className="gallery-overlay">
                      <div className="overlay-content">
                        <h5 className="image-title">{image.title}</h5>
                        <p className="image-description">{image.description}</p>
                        <div className="image-meta">
                          <span className="badge bg-light text-dark me-2">
                            <i className="fas fa-images me-1"></i> Image {index + 1}
                          </span>
                          <span className="badge bg-light text-dark me-2">
                            <i className="fas fa-calendar me-1"></i> {formatDisplayDate(image.date)}
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

      {selectedImage && (
        <div className={`portfolio-slider-modal ${isDetailView ? 'show-detail' : ''}`}>
          <div className="slider-container">
            <button className="slider-close-btn" onClick={handleCloseModal}>
              <i className="fas fa-times"></i>
            </button>
            <button className="slider-nav prev" onClick={goToPrev}>
              <i className="fas fa-chevron-left"></i>
            </button>
            <button className="slider-nav next" onClick={goToNext}>
              <i className="fas fa-chevron-right"></i>
            </button>

            <div className="image-list">
              {filteredImages.map((image, index) => (
                <div
                  key={image.id}
                  className={`image-item ${index === currentIndex ? 'active' : ''}`}
                  style={getTransformStyle(index)}
                >
                  {index === currentIndex ? (
                    <>
                      <div className="image-center">
                        <img
                          src={image.src}
                          alt={image.title}
                          className="slider-main-image"
                          onError={(e) => { e.target.src = '/placeholder-image.jpg'; }}
                        />
                      </div>
                      <div className="right-content">
                        <div className="content-wrapper">
                          <div className="intro-topic">{image.title}</div>
                          <div className="intro-description">{image.description}</div>
                          <div className="image-counter">
                            <span className="current-index">{currentIndex + 1}</span>
                            <span className="separator">/</span>
                            <span className="total-count">{filteredImages.length}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <img src={image.thumbnail} alt={image.title} className="slider-secondary-image" />
                  )}
                </div>
              ))}
            </div>

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