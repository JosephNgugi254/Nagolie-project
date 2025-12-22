import { useState, useEffect } from "react"

function ImageCarousel({ images, title, height = "200px", onImageClick }) {
    const [currentIndex, setCurrentIndex] = useState(0)

    useEffect(() => {
        if (!images || images.length <= 1) return

        const timer = setTimeout(() => {
            setCurrentIndex((prevIndex) =>
                prevIndex === images.length - 1 ? 0 : prevIndex + 1
            )
        }, 4000)

        return () => clearTimeout(timer)
    }, [currentIndex, images])

    if (!images || images.length === 0) {
        return (
            <div
                className="bg-secondary d-flex align-items-center justify-content-center"
                style={{ height, objectFit: "cover", cursor: onImageClick ? 'pointer' : 'default' }}
                onClick={() => onImageClick && onImageClick(0)}
            >
                <i className="fas fa-image fa-3x text-light"></i>
            </div>
        )
    }

    const goToPrevious = () => {
        const isFirstImage = currentIndex === 0
        const newIndex = isFirstImage ? images.length - 1 : currentIndex - 1
        setCurrentIndex(newIndex)
    }

    const goToNext = () => {
        const isLastImage = currentIndex === images.length - 1
        const newIndex = isLastImage ? 0 : currentIndex + 1
        setCurrentIndex(newIndex)
    }

    const goToSlide = (slideIndex) => {
        setCurrentIndex(slideIndex)
    }

    const handleImageClick = () => {
        if (onImageClick) {
            onImageClick(currentIndex)
        }
    }

    return (
        <div className="carousel-container position-relative">
            {/* Main Image */}
            <div
                className="carousel-slide"
                style={{ cursor: onImageClick ? 'pointer' : 'default' }}
                onClick={handleImageClick}
            >
                <img
                    src={images[currentIndex]}
                    className="d-block w-100"
                    alt={`${title} - Image ${currentIndex + 1}`}
                    style={{ height, objectFit: "cover" }}
                />
            </div>

            {/* Navigation Arrows - Only show if multiple images */}
            {images.length > 1 && (
                <>
                    <button
                        className="carousel-control prev position-absolute top-50 start-0 translate-middle-y btn btn-sm btn-light"
                        onClick={goToPrevious}
                        style={{ left: '10px', zIndex: 1 }}
                    >
                        <i className="fas fa-chevron-left"></i>
                    </button>
                    <button
                        className="carousel-control next position-absolute top-50 end-0 translate-middle-y btn btn-sm btn-light"
                        onClick={goToNext}
                        style={{ right: '10px', zIndex: 1 }}
                    >
                        <i className="fas fa-chevron-right"></i>
                    </button>
                </>
            )}

            {/* Indicators/Dots - Only show if multiple images */}
            {images.length > 1 && (
                <div
                    className="carousel-indicators position-absolute bottom-0 start-0 end-0 mb-2"
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    {images.map((_, index) => (
                        <button
                            key={index}
                            className={`indicator-btn mx-1 ${currentIndex === index ? 'active' : ''}`}
                            onClick={() => goToSlide(index)}
                            style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                border: 'none',
                                backgroundColor: currentIndex === index ? '#007bff' : 'rgba(255,255,255,0.5)',
                                cursor: 'pointer',
                                transition: 'background-color 0.3s'
                            }}
                            aria-label={`Go to slide ${index + 1}`}
                        />
                    ))}
                </div>
            )}

            {/* Optional counter (uncomment if you want it back) */}
            {/* {images.length > 1 && (
                <div
                    className="position-absolute top-0 end-0 m-2 bg-dark bg-opacity-50 text-white rounded px-2 py-1"
                    style={{ fontSize: '0.75rem', zIndex: 1 }}
                >
                    {currentIndex + 1} / {images.length}
                </div>
            )} */}
        </div>
    )
}

export default ImageCarousel