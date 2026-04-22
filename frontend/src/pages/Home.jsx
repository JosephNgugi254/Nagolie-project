"use client"

import { Link } from "react-router-dom"
import { useEffect, useRef, useState } from "react"
import { motion, useMotionValue, useSpring, useInView } from "framer-motion"
import CountUp from "react-countup"
import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"
import LoanApply from "../features/loans/LoanApply"
import { adminAPI, loanAPI } from "../services/api"
import ImageCarousel from "../components/common/ImageCarousel"
import Toast, { showToast } from "../components/common/Toast"
import SEO from '../components/common/SEO'

// ========== Interactive Livestock Icon (Floating Cow) ==========
const InteractiveLivestockIcon = () => {
  const cursorX = useMotionValue(0)
  const cursorY = useMotionValue(0)
  const springX = useSpring(cursorX, { damping: 30, stiffness: 200 })
  const springY = useSpring(cursorY, { damping: 30, stiffness: 200 })

  useEffect(() => {
    const move = (e) => {
      cursorX.set(e.clientX - 25)
      cursorY.set(e.clientY - 25)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [cursorX, cursorY])

  return (
    <motion.div
      className="floating-cow"
      style={{ x: springX, y: springY, position: 'fixed', pointerEvents: 'none', zIndex: 1000 }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 0.6, scale: 1 }}
      transition={{ delay: 1, duration: 0.5 }}
    >
      <i className="fas fa-cow fa-2x"></i>
    </motion.div>
  )
}

function Home() {
  const sliderRef = useRef(null)
  const dotsRef = useRef(null)
  const currentIndexRef = useRef(0)
  const autoSlideIntervalRef = useRef(null)

  // Stats animation ref
  const statsRef = useRef(null)
  const isStatsInView = useInView(statsRef, { once: true, amount: 0.3 })

  // state variables
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedLivestockItem, setSelectedLivestockItem] = useState(null);

  // Add state for livestock and loading
  const [livestock, setLivestock] = useState([]);
  const [livestockLoading, setLivestockLoading] = useState(true);
  const [livestockError, setLivestockError] = useState(false);

  const [livestockPage, setLivestockPage] = useState(1);
  const [livestockHasMore, setLivestockHasMore] = useState(false);
  const [livestockTotalPages, setLivestockTotalPages] = useState(1);

  // Typewriter effect state
  const [typewriterText, setTypewriterText] = useState("");
  const fullTagline = "Investing in Living Assets";
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [typewriterComplete, setTypewriterComplete] = useState(false);

  useEffect(() => {
    if (typewriterIndex < fullTagline.length) {
      const timeout = setTimeout(() => {
        setTypewriterText(prev => prev + fullTagline[typewriterIndex]);
        setTypewriterIndex(prev => prev + 1);
      }, 80);
      return () => clearTimeout(timeout);
    } else if (!typewriterComplete) {
      setTypewriterComplete(true);
    }
  }, [typewriterIndex, typewriterComplete]);

  // image clicks handler
  const handleImageClick = (livestock, imageIndex = 0) => {
    setSelectedLivestockItem(livestock);
    setSelectedImage(livestock.images[imageIndex] || null);
    setShowImageModal(true);
  };

  const handleLoanSubmit = async (formData) => {
    try {
      console.log("Loan application submitted:", formData)

      const applicationData = {
        full_name: formData.fullName,
        phone_number: formData.phoneNumber,
        id_number: formData.idNumber,
        email: formData.email || '',
        loan_amount: parseFloat(formData.loanAmount),
        livestock_type: formData.livestockType,
        count: parseInt(formData.count) || 1,
        estimated_value: parseFloat(formData.estimatedValue) || 0,
        location: formData.location || '',
        notes: formData.notes || '',
        photos: formData.photos || [],
        repaymentPlan: formData.repaymentPlan
      }

      console.log("Sending to backend:", applicationData)

      const response = await loanAPI.apply(applicationData)

      if (response.data.success) {
        showToast.success("Thank you for your application! We will contact you shortly.")
        console.log("Application submitted successfully:", response.data)
        return { success: true, data: response.data }
      } else {
        showToast.error("There was an error submitting your application. Please try again.")
        return { success: false, error: response.data.error }
      }
    } catch (error) {
      console.error("Error submitting application:", error)
      const errorMessage = error.response?.data?.error || "There was an error submitting your application. Please try again."
      showToast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  useEffect(() => {
    const slider = sliderRef.current
    const dotsContainer = dotsRef.current
    if (!slider || !dotsContainer) return

    const testimonialCards = slider.querySelectorAll(".testimonial-card")
    const totalTestimonials = testimonialCards.length

    const getCardsPerView = () => {
      if (window.innerWidth < 768) return 1
      if (window.innerWidth < 992) return 2
      return 3
    }

    let cardsPerView = getCardsPerView()
    let totalSlides = Math.ceil(totalTestimonials / cardsPerView)

    const createDots = () => {
      dotsContainer.innerHTML = ""
      for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement("div")
        dot.classList.add("testimonial-dot")
        if (i === 0) dot.classList.add("active")
        dot.addEventListener("click", () => goToSlide(i))
        dotsContainer.appendChild(dot)
      }
    }

    const updateSlider = () => {
      const cardWidth = testimonialCards[0].offsetWidth + 30
      const translateX = -currentIndexRef.current * cardWidth * cardsPerView
      slider.style.transform = `translateX(${translateX}px)`
      const dots = dotsContainer.querySelectorAll(".testimonial-dot")
      dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === currentIndexRef.current)
      })
    }

    const goToSlide = (index) => {
      currentIndexRef.current = index
      updateSlider()
    }

    const handleResize = () => {
      const newCardsPerView = getCardsPerView()
      if (newCardsPerView !== cardsPerView) {
        cardsPerView = newCardsPerView
        totalSlides = Math.ceil(totalTestimonials / cardsPerView)
        currentIndexRef.current = 0
        createDots()
        updateSlider()
      }
    }

    const startAutoSlide = () => {
      autoSlideIntervalRef.current = setInterval(() => {
        if (currentIndexRef.current < totalSlides - 1) {
          currentIndexRef.current++
        } else {
          currentIndexRef.current = 0
        }
        updateSlider()
      }, 6000)
    }

    const stopAutoSlide = () => {
      if (autoSlideIntervalRef.current) {
        clearInterval(autoSlideIntervalRef.current)
      }
    }

    createDots()
    updateSlider()
    startAutoSlide()

    window.addEventListener("resize", handleResize)
    slider.addEventListener("mouseenter", stopAutoSlide)
    slider.addEventListener("mouseleave", startAutoSlide)

    return () => {
      stopAutoSlide()
      window.removeEventListener("resize", handleResize)
      slider.removeEventListener("mouseenter", stopAutoSlide)
      slider.removeEventListener("mouseleave", startAutoSlide)
    }
  }, [])

  const nextSlide = () => {
    const slider = sliderRef.current
    if (!slider) return
    const testimonialCards = slider.querySelectorAll(".testimonial-card")
    const totalTestimonials = testimonialCards.length
    const cardsPerView = window.innerWidth < 768 ? 1 : window.innerWidth < 992 ? 2 : 3
    const totalSlides = Math.ceil(totalTestimonials / cardsPerView)

    if (currentIndexRef.current < totalSlides - 1) {
      currentIndexRef.current++
      const cardWidth = testimonialCards[0].offsetWidth + 30
      const translateX = -currentIndexRef.current * cardWidth * cardsPerView
      slider.style.transform = `translateX(${translateX}px)`
      const dots = dotsRef.current.querySelectorAll(".testimonial-dot")
      dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === currentIndexRef.current)
      })
    }
  }

  const prevSlide = () => {
    const slider = sliderRef.current
    if (!slider) return
    const testimonialCards = slider.querySelectorAll(".testimonial-card")
    const cardsPerView = window.innerWidth < 768 ? 1 : window.innerWidth < 992 ? 2 : 3
    const totalSlides = Math.ceil(testimonialCards.length / cardsPerView)

    if (currentIndexRef.current > 0) {
      currentIndexRef.current--
      const cardWidth = testimonialCards[0].offsetWidth + 30
      const translateX = -currentIndexRef.current * cardWidth * cardsPerView
      slider.style.transform = `translateX(${translateX}px)`
      const dots = dotsRef.current.querySelectorAll(".testimonial-dot")
      dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === currentIndexRef.current)
      })
    }
  }

  const fetchLivestock = async (page = 1, append = false) => {
    try {
      setLivestockLoading(true);
      setLivestockError(false);
      console.log(`Fetching livestock gallery page ${page}...`);
      const response = await adminAPI.getPublicLivestockGallery(page, 12);

      console.log('Full API response:', response);
      console.log('Response data:', response.data);

      if (response.data && response.data.items) {
        console.log('Items count:', response.data.items.length);
        console.log('Livestock items:', response.data.items);

        setLivestockTotalPages(response.data.pages);
        setLivestockHasMore(page < response.data.pages);

        if (append) {
          setLivestock(prev => [...prev, ...response.data.items]);
        } else {
          setLivestock(response.data.items);
        }
      } else if (Array.isArray(response.data)) {
        console.log('Direct array response, items count:', response.data.length);
        setLivestock(response.data);
        setLivestockHasMore(false);
      } else {
        console.error('Unexpected response format:', response.data);
        setLivestock([]);
        setLivestockError(true);
      }
    } catch (error) {
      console.error('Error fetching livestock:', error);
      console.error('Error details:', error.response?.data);
      setLivestock([]);
      setLivestockError(true);
      showToast.error("Failed to load livestock gallery. Please try again later.");
    } finally {
      setLivestockLoading(false);
    }
  };

  useEffect(() => {
    fetchLivestock(1, false);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KES",
    }).format(Number(amount) || 0);
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('?livestock=')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const livestockId = params.get('livestock');

      if (livestockId) {
        if (!livestockLoading && livestock.length > 0) {
          const selectedItem = livestock.find(item => item.id.toString() === livestockId.toString());

          if (selectedItem) {
            const gallerySection = document.getElementById('gallery');
            if (gallerySection) {
              gallerySection.scrollIntoView({ behavior: 'smooth' });
            }

            setTimeout(() => {
              setSelectedLivestockItem(selectedItem);
              setSelectedImage(selectedItem.images[0] || null);
              setShowImageModal(true);
              
              const livestockElement = document.querySelector(`[data-livestock-id="${livestockId}"]`);
              if (livestockElement) {
                livestockElement.classList.add('highlight-livestock');
                setTimeout(() => {
                  livestockElement.classList.remove('highlight-livestock');
                }, 5000);
              }
            }, 1000);
            
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
      }
    }
  }, [livestock, livestockLoading]);

  return (
    <div>
      <SEO 
        title="Nagolie - Livestock Backed Lending Solutions in Kajiado, Kenya"
        description="Get affordable livestock loans and agricultural financing in Kajiado County. Cattle financing, livestock collateral loans, and farm credit solutions."
        keywords="livestock loans Kenya, agricultural financing Kajiado, cattle loans Kenya, livestock collateral, farm loans Kajiado, Nagolie lending, livestock backed lending Kajiado"
      />
      <Navbar />
      <Toast />
      <InteractiveLivestockIcon />

      {/* Hero Section */}
      <section id="home" className="hero-section">
        <div className="hero-overlay"></div>
        <div className="container container-hero">
          <div className="row align-items-center min-vh-100">
            <div className="col-lg-8 mx-auto text-center text-white">
              <div className="hero-content">
                <h1 className="display-3 fw-bold mb-4">
                  {typewriterText}
                  {!typewriterComplete && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                      style={{ display: "inline-block", width: "3px", backgroundColor: "white", marginLeft: "4px" }}
                    >
                      |
                    </motion.span>
                  )}
                </h1>
                <motion.p
                  className="lead mb-5"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 1.2 }}
                >
                  Transform your livestock into immediate financial opportunities. Quick, secure, reliable and trusted
                  services in Isinya, Kajiado County.
                </motion.p>
                <div className="hero-buttons">
                  <a href="#loan-application" className="btn btn-primary btn-lg me-3">
                    Submit Livestock Offer
                  </a>
                  <Link to="/about" className="btn btn-outline-light btn-lg">
                    Learn More
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-5 bg-light">
        <div className="container">
          <div className="row">
            {[
              { icon: "fa-clock", title: "Quick Processing", text: "Get cash for your livestock in hours. Our streamlined process ensures fast access to cash when you need them most." },
              { icon: "fa-shield-alt", title: "Secure & Reliable", text: "We secure your livestock sale with transparent terms, professional valuations, and reliable handling every step of the way." },
              { icon: "fa-mobile-alt", title: "M-Pesa Integration", text: "Convenient payment options through M-Pesa. Receive funds directly through your mobile phone." }
            ].map((feature, index) => (
              <motion.div
                key={index}
                className="col-lg-4 text-center mb-4"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <motion.div 
                  className="feature-card h-100 p-4"
                  whileHover={{ scale: 1.03, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <div className="feature-icon mb-3">
                    <motion.i
                      className={`fas ${feature.icon} fa-3x text-primary`}
                      whileHover={{ rotate: 5, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    ></motion.i>
                  </div>
                  <h4>{feature.title}</h4>
                  <p className="text-muted">{feature.text}</p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section with CountUp Stats */}
      <motion.section
        id="about"
        className="py-5"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-12 mb-5 col-sm-12 text-justify">
              <h2 className="display-5 fw-bold mb-4 text-center">About us</h2>
              <p className="lead mb-4">
                Your local partner for turning livestock into cash in Isinya, Kajiado County,
                through fair and innovative buying solutions
              </p>
              <p className="mb-4">
                At Nagolie Enterprises, we understand the central role that livestock plays in the livelihoods of our community. We provide quick, reliable buying services that recognize and respect the true value of your livestock. Our professional valuation process ensures fair and transparent purchase terms, 
                while our streamlined approach guarantees you access to funds when you need them most.
              </p>
              <p className="mb-4">
                Built on the pillars of <strong>integrity, transparency, and efficiency</strong>, 
                we are committed to empowering livestock owners with purchase opportunities that inspire trust and deliver results.
                With Nagolie, you don't just sell your livestock, you gain a dependable partner dedicated to supporting your growth and stability
              </p>

              {/* Stats with CountUp */}
              <div className="row mt-5" ref={statsRef}>
                <div className="col-4">
                  <div className="stat-item text-center">
                    <h3 className="text-primary fw-bold">
                      {isStatsInView && <CountUp end={2500} duration={2} suffix="+" />}
                    </h3>
                    <p className="text-muted">Happy Clients</p>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stat-item text-center">
                    <h3 className="text-primary fw-bold">
                      {isStatsInView && <CountUp end={10} duration={2} suffix="M+" prefix="KSh " />}
                    </h3>
                    <p className="text-muted">Disbursed funds</p>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stat-item text-center">
                    <h3 className="text-primary fw-bold">
                      {isStatsInView && <CountUp end={5} duration={2} suffix="+ Years" />}
                    </h3>
                    <p className="text-muted">Trusted Service</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Mission, Vision, Values */}
      <motion.section
        className="py-5 bg-primary text-white"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="container">
          <div className="row">
            {[
              { icon: "bullseye", title: "Our Mission", text: "To provide accessible, financial solutions that empower rural communities, strengthen livelihoods, and drive agricultural growth across Kenya." },
              { icon: "eye", title: "Our Vision", text: "To become the premier livestock acquisition partner, driving sustainable economic development through innovation and reliability." },
              { icon: "heart", title: "Our Values", text: "Integrity, transparency, respect for livestock owners, and a firm commitment to efficiency, fairness, and supporting rural prosperity." }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                className="col-lg-4 mb-4"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <motion.div 
                  className="mvv-card text-center"
                  whileHover={{ scale: 1.03, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <i className={`fas fa-${item.icon} fa-3x mb-3`}></i>
                  <h4>{item.title}</h4>
                  <p>{item.text}</p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Services Section */}
      <motion.section
        id="services"
        className="py-5"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="display-5 fw-bold">Our Services</h2>
            <p className="lead text-muted">Comprehensive livestock purchase solutions</p>
          </div>
          <div className="row">
            {[
              {
                icon: "fa-coins",
                title: "Quick Purchases",
                text: "Get cash offers from as low as KSh 1,000 up to KSh 1,000,000 for your livestock. Professional valuation ensures fair terms.",
                items: ["Purchases processed within 24 to 48 hours", "Competitive market rates", "Flexible sale terms", "Professional livestock valuation"]
              },
              {
                icon: "fa-mobile-alt",
                title: "Mobile Money Services",
                text: "Enjoy seamless transactions directly from your phone. Instantly receive purchase disbursement funds and handle your sales through M-Pesa.",
                items: ["Instant fund disbursement", "Secure, reliable transactions", "Convenient sale confirmations"]
              },
              {
                icon: "fa-store",
                title: "Livestock Marketplace",
                text: "Access a trusted marketplace to buy or sell livestock with ease. Whether you're sourcing new stock or offloading animals for cash, Nagolie ensures you get the best value.",
                items: ["Better market access for your livestock", "Reliable sourcing for quality livestock"]
              }
            ].map((service, index) => (
              <motion.div
                key={index}
                className="col-lg-4 mb-4"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <motion.div 
                  className="service-card p-4 h-100"
                  whileHover={{ scale: 1.03, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <i className={`fas ${service.icon} fa-2x text-primary mb-3`}></i>
                  <h4>{service.title}</h4>
                  <p className="text-muted">{service.text}</p>
                  <ul className="list-unstyled">
                    {service.items.map((item, i) => (
                      <li key={i}>
                        <i className="fas fa-check text-success me-2"></i>{item}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Testimonials Section */}
      <motion.section
        id="testimonials"
        className="py-5 bg-light"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="display-5 fw-bold">What Our clients Say</h2>
            <p className="lead text-muted">Hear from livestock owners who have transformed their lives through Nagolie</p>
          </div>

          <div className="testimonials-container position-relative">
            <div className="testimonials-wrapper">
              <button className="testimonial-nav testimonial-prev" onClick={prevSlide}>
                <i className="fas fa-chevron-left"></i>
              </button>

              <div className="testimonials-slider-container">
                <div className="testimonials-slider" ref={sliderRef}>
                  {[
                    { name: "Terry Nashipai", location: "Isinya, Kajiado", quote: "Nagolie bought my livestock when I needed cash fast for my children's school fees. Their quick processing meant my kids didn't miss a single day of school. The M-Pesa payment was so convenient!" },
                    { name: "Ivy Akinyi", location: "Isinya, Kajiado", quote: "When my mother was hospitalized, I sold my goats to Nagolie to clear the medical bills. Their valuation was fair, and I got the cash the same day. They truly understand emergencies." },
                    { name: "Kelvin Lemayian", location: "Isinya, Kajiado", quote: "My small shop was running out of stock, and I needed quick cash to restock. Selling to Nagolie saved my business. The terms were flexible and fair." },
                    { name: "Francis Katei", location: "Isinya, Kajiado", quote: "I needed capital to expand my poultry farming, so I sold some chickens to Nagolie. Now my business has doubled in size thanks to that quick cash!" },
                    { name: "Beatrice Nayian", location: "Isinya, Kajiado", quote: "During the drought season, I needed money to buy feed for my cattle, so I sold a few to Nagolie. Their quick process helped me save my herd. Their service is a lifeline for livestock farmers." },
                    { name: "Elijah Matura", location: "Isinya, Kajiado", quote: "I was able to pay for my daughter's university fees after selling my sheep to Nagolie. The process was straightforward, transparent, and respectful." }
                  ].map((testimonial, index) => (
                    <motion.div
                      key={index}
                      className="testimonial-card"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                    >
                      <div className="testimonial-content">
                        <div className="client-image">
                          <img src="/user-image.png" alt={testimonial.name} />
                        </div>
                        <div className="testimonial-text">
                          <p className="quote">"{testimonial.quote}"</p>
                          <div className="client-info">
                            <h5 className="client-name">{testimonial.name}</h5>
                            <p className="client-location">{testimonial.location}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <button className="testimonial-nav testimonial-next" onClick={nextSlide}>
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>

            <div className="testimonial-dots" ref={dotsRef}></div>
          </div>
        </div>
      </motion.section>

      {/* Livestock Gallery - NO DELAYS, INSTANT APPEARANCE */}
      <section id="gallery" className="py-5">
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="display-5 fw-bold">Available Livestock</h2>
            <p className="lead">Quality livestock available for purchase</p>
          </div>
          
          {livestockLoading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
                <span className="visually-hidden">Loading livestock...</span>
              </div>
              <p className="mt-3 text-muted">Loading available livestock...</p>
            </div>
          ) : livestockError ? (
            <div className="col-12 text-center">
              <div className="alert alert-warning">
                <i className="fas fa-exclamation-triangle me-2"></i>
                No livestock available at the moment. Please check back later.
              </div>
            </div>
          ) : livestock.length === 0 ? (
            <div className="col-12 text-center">
              <div className="alert alert-info">
                <i className="fas fa-info-circle me-2"></i>
                No livestock available at the moment. Please check back later.
              </div>
            </div>
          ) : (
            <>
              <div className="row" id="livestock-gallery">
                {livestock.map((item) => (
                  <motion.div
                    key={item.id}
                    className="col-md-4 mb-4"
                    data-livestock-id={item.id}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-20px" }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.div 
                      className="card h-100"
                      whileHover={{ scale: 1.02, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <ImageCarousel 
                        images={item.images} 
                        title={item.title}
                        height="200px"
                        onImageClick={(index) => handleImageClick(item, index)} 
                      />
      
                      <div className="card-body d-flex flex-column">
                        <h5 className="card-title">{item.title}</h5>
                        <p className="card-text flex-grow-1 livestock-description">{item.description || 'Available for purchase'}</p>
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
                        <button 
                          className="btn btn-primary mt-auto"
                          onClick={() => {
                            const message = `Hello team, I am interested in the ${item.title} going for ${formatCurrency(item.price)}. Could you kindly provide more information regarding its availability and purchase process?`
                            const encodedMessage = encodeURIComponent(message)
                            window.open(`https://wa.me/254721451707?text=${encodedMessage}`, '_blank')
                          }}
                        >
                          <i className="fab fa-whatsapp me-2"></i>Inquire on WhatsApp
                        </button>
                      </div>
                      <div className="card-footer">
                        <small className="text-muted livestock-location">
                          <i className="fas fa-map-marker-alt me-1"></i>
                          {item.location || 'Isinya, Kajiado'}
                        </small>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </div>
              
              {livestockHasMore && (
                <div className="text-center mt-4">
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => {
                      const nextPage = livestockPage + 1;
                      setLivestockPage(nextPage);
                      fetchLivestock(nextPage, true);
                    }}
                    disabled={livestockLoading}
                  >
                    {livestockLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
          
      {/* Loan Application Form */}
      <motion.section
        id="loan-application"
        className="py-5"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              <motion.div 
                className="card shadow"
                whileHover={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="card-header bg-primary text-white text-center">
                  <h3 className="mb-0">Livestock Sales Proposal Form</h3>
                </div>
                <div className="card-body p-4">
                  <LoanApply onSubmit={handleLoanSubmit} />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Contact Section */}
      <motion.section
        id="contact"
        className="py-5 bg-dark text-white"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container">
          <div className="row">
            <div className="col-lg-6 mb-4">
              <h2 className="display-5 fw-bold mb-4">Contact Us</h2>
              <div className="contact-info">
                <div className="contact-item mb-3">
                  <i className="fas fa-map-marker-alt me-3"></i>
                  <a 
                    href="https://www.google.com/maps/search/?api=1&query=8R7W%2B39M%2C%20Isinya" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-white text-decoration-none"
                  >
                    Target Isinya Town 
                  </a>
                </div>
                <div className="contact-item mb-3">
                  <i className="fas fa-phone me-3"></i>
                  <a href="tel:+254721451707" className="text-white text-decoration-none">
                    +254 721 451 707
                  </a>
                </div>
                <div className="contact-item mb-3">
                  <a href="tel:+254763003182" className="text-white text-decoration-none second-number">
                    +254 763 003 182
                  </a>
                </div>
                <div className="contact-item mb-3">
                  <i className="fas fa-envelope me-3"></i>
                  <a href="mailto:nagolieenterprises@gmail.com" className="text-white text-decoration-none">
                    nagolieenterprises@gmail.com
                  </a>
                </div>
                <div className="contact-item mb-3">
                  <i className="fas fa-clock me-3"></i>
                  <span>Everyday : 8:00 AM - 6:00 PM</span>
                </div>
              </div>              
            </div>
            <div className="col-lg-6">
              <form id="contactForm">
                <div className="mb-3">
                  <input type="text" className="form-control" placeholder="Your Name" required />
                </div>
                <div className="mb-3">
                  <input type="email" className="form-control" placeholder="Your Email" required />
                </div>
                <div className="mb-3">
                  <input type="tel" className="form-control" placeholder="Your Phone" />
                </div>
                <div className="mb-3">
                  <textarea className="form-control" rows="4" placeholder="Your Message" required></textarea>
                </div>
                <button type="submit" className="btn btn-primary">
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </div>
      </motion.section>

      <Footer />

      {/* Image Zoom Modal for Home Page */}
      {showImageModal && selectedImage && selectedLivestockItem && (
        <div className="modal fade show d-block" tabIndex="-1" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{selectedLivestockItem.title}</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => {
                    setShowImageModal(false);
                    setSelectedImage(null);
                    setSelectedLivestockItem(null);
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="text-center">
                  <img 
                    src={selectedImage} 
                    alt={selectedLivestockItem.title} 
                    className="img-fluid rounded"
                    style={{ maxHeight: '70vh', width: 'auto' }}
                  />
                </div>
                
                {selectedLivestockItem.images.length > 1 && (
                  <div className="row mt-3">
                    <div className="col-12">
                      <p className="text-muted mb-2">More images:</p>
                      <div className="d-flex flex-wrap gap-2">
                        {selectedLivestockItem.images.map((img, index) => (
                          <img
                            key={index}
                            src={img}
                            alt={`${selectedLivestockItem.title} ${index + 1}`}
                            className="img-thumbnail cursor-pointer"
                            style={{ 
                              width: '80px', 
                              height: '80px', 
                              objectFit: 'cover',
                              border: img === selectedImage ? '3px solid #007bff' : '1px solid #dee2e6'
                            }}
                            onClick={() => setSelectedImage(img)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <h6>Details</h6>
                  <p>{selectedLivestockItem.description}</p>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="h5 text-primary">{formatCurrency(selectedLivestockItem.price)}</span>
                    <span className={`badge ${
                      selectedLivestockItem.daysRemaining > 1 ? 'bg-warning' : 
                      selectedLivestockItem.daysRemaining === 1 ? 'bg-info' : 
                      'bg-success'
                    }`}>
                      {selectedLivestockItem.availableInfo}
                    </span>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowImageModal(false);
                    setSelectedImage(null);
                    setSelectedLivestockItem(null);
                  }}
                >
                  Close
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    const message = `Hello team, I am interested in the ${selectedLivestockItem.title} going for ${formatCurrency(selectedLivestockItem.price)}. Could you kindly provide more information regarding its availability and purchase process?`
                    const encodedMessage = encodeURIComponent(message)
                    window.open(`https://wa.me/254721451707?text=${encodedMessage}`, '_blank')
                    setShowImageModal(false);
                    setSelectedImage(null);
                    setSelectedLivestockItem(null);
                  }}
                >
                  <i className="fab fa-whatsapp me-2"></i>Inquire on WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home