"use client"

import { Link } from "react-router-dom"
import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"
import SEO from '../components/common/SEO'

function About() {
  return (
    <div>
      <SEO 
        title="About Nagolie - Livestock Lending in Kajiado County"
        description="Learn about Nagolie's mission to provide livestock-backed financing solutions to farmers in Kajiado County and across Kenya."
        keywords="about Nagolie, livestock lending Kenya, Kajiado agricultural financing, our mission, farming community support"
      />
      <Navbar />

      {/* About Hero Section */}
      <section className="about-hero-section py-5 mt-5">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-8 mx-auto text-center">
              <h1 className="display-4 fw-bold mb-4 text-primary">About Nagolie Enterprises</h1>
              <p className="lead mb-4">Revolutionizing direct livestock acquisitions in Kajiado County</p>
            </div>
          </div>
        </div>
      </section>

      {/* About Content Section */}
      <section className="py-5">
        <div className="container">
          <div className="row align-items-center">
            {/* About Text */}
            <div className="col-lg-6 mb-5">
              <h2 className="display-5 fw-bold mb-4">Our Story</h2>
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

              {/* Stats */}
              <div className="row mt-5">
                <div className="col-4">
                  <div className="stat-item text-center">
                    <h3 className="text-primary fw-bold">2500+</h3>
                    <p className="text-muted">Happy Clients</p>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stat-item text-center">
                    <h3 className="text-primary fw-bold">KSh 10M+</h3>
                    <p className="text-muted">Disbursed funds</p>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stat-item text-center">
                    <h3 className="text-primary fw-bold">5+ Years</h3>
                    <p className="text-muted">Trusted Service</p>
                  </div>
                </div>
              </div>
            </div>

            {/* About Image */}
            <div className="col-lg-6">
              <div className="about-image">
                <img
                  src="/logo.png"
                  alt="Nagolie Enterprises"
                  className="img-fluid rounded shadow"
                  width="500"
                  height="400"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission, Vision, Values */}
      <section className="py-5 bg-primary text-white">
        <div className="container">
          <div className="row">
            {/* Mission */}
            <div className="col-lg-4 mb-4">
              <div className="mvv-card text-center">
                <i className="fas fa-bullseye fa-3x mb-3"></i>
                <h4>Our Mission</h4>
                <p>
                  To provide accessible, financial solutions that empower rural communities, strengthen
                  livelihoods, and drive agricultural growth across Kenya.
                </p>
              </div>
            </div>
            {/* Vision */}
            <div className="col-lg-4 mb-4">
              <div className="mvv-card text-center">
                <i className="fas fa-eye fa-3x mb-3"></i>
                <h4>Our Vision</h4>
                <p>
                  To become the premier livestock acquisition partner, driving sustainable economic
                  development through innovation and reliability.
                </p>
              </div>
            </div>
            {/* Values */}
            <div className="col-lg-4 mb-4">
              <div className="mvv-card text-center">
                <i className="fas fa-heart fa-3x mb-3"></i>
                <h4>Our Values</h4>
                <p>
                  Integrity, transparency, respect for livestock owners, and a firm commitment to efficiency, fairness,
                  and supporting rural prosperity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section id="team" className="py-5 bg-light">
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="display-4 fw-bold mb-3">Meet Our Leadership Team</h2>
            <p className="lead text-muted">The passionate individuals driving Nagolie's mission forward</p>
          </div>

          <div className="row justify-content-center">
            {/* CEO */}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="/Shaddy CEO.png" alt="CEO - Nagolie Enterprises" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="https://wa.me/254721451707" className="social-link">
                        <i className="fab fa-whatsapp"></i>
                      </a>
                      <a href="mailto:kesumetshadrack@gmail.com" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">Shadrack Kesumet</h4>
                  <p className="team-role">Chief Executive Officer and Founder</p>
                  <p className="team-bio">
                    He has a deep understanding of rural financial needs and brings an ambitious, problem-solving
                    mentality to every challenge.
                  </p>
                </div>
              </div>
            </div>

            {/* Livestock Valuer */}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="/george1.jpeg" alt="livestock Valuer" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">                      
                      <a href="https://wa.me/254703994290" className="social-link">
                        <i className="fab fa-whatsapp"></i>
                      </a>
                      <a href="mailto:georgemarite@gmail.com" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">George Marite</h4>
                  <p className="team-role">Senior Livestock Valuer</p>
                  <p className="team-bio">
                    Expert in livestock valuation and local market dynamics, ensuring accurate assessments and fair
                    purchase terms for all clients.
                  </p>
                </div>
              </div>
            </div>

            {/* Head Accountant */}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="/gideon.jpeg" alt="Head Accountant" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="https://wa.me/254720916093" className="social-link">
                        <i className="fab fa-whatsapp"></i>
                      </a>
                      <a href="mailto:gmatunta2015@gmail.com" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">Gideon Pashile</h4>
                  <p className="team-role">Head Accountant</p>
                  <p className="team-bio">
                    Oversees all financial operations, ensures accurate record-keeping,
                     and supports sound financial decision-making for Nagolie Enterprises.
                  </p>
                </div>
              </div>
            </div>

            {/* secretary */}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="/flo.png" alt="secretary" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="https://wa.me/0722370124" className="social-link">
                        <i className="fab fa-whatsapp"></i>
                      </a>
                      <a href="" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">Florence Wacuka</h4>
                  <p className="team-role">Secretary</p>
                  <p className="team-bio">
                    Coordinates schedules and communications, manages administrative and clerical tasks, and ensures smooth day-to-day office operations while supporting the entire team at Nagolie Enterprises.
                  </p>    
                </div>
              </div>
            </div>

            {/* Technical Operation Manager */}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="/solitary.png" alt="Head of IT" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="www.linkedin.com/in/joseph-ngugi-2a78991b7" className="social-link">
                        <i className="fab fa-linkedin"></i>
                      </a>
                      <a href="https://wa.me/254797644034" className="social-link">
                        <i className="fab fa-whatsapp"></i>
                      </a>
                      <a href="mailto:solitaryjoe069@gmail.com" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">Joseph Ngugi</h4>
                  <p className="team-role">Technical Operations Manager</p>
                  <p className="team-bio">
                    Head of IT Operations, responsible for managing the Company's systems, ensuring smooth performance,
                    and fulfilling all company IT needs.
                  </p>
                </div>
              </div>
            </div>

            {/* Legal Consultant */}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="/Timothy.png" alt="Legal consultant" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="https://wa.me/" className="social-link">
                        <i className="fab fa-whatsapp"></i>
                      </a>
                      <a href="" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">Tait Lesiamon</h4>
                  <p className="team-role">Legal Consultant</p>
                  <p className="team-bio">
                    Provides expert legal guidance, ensures compliance with all regulatory requirements, and protects the interests of Nagolie Enterprises and its clients in every transaction.
                  </p>
                </div>
              </div>
            </div>

            {/* livestock production officer*/}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="./Joshua.png" alt="livestock production officer" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="https://wa.me/" className="social-link">
                        <i className="fab fa-whatsapp"></i>
                      </a>
                      <a href="" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">Joshua Partapipi</h4>
                  <p className="team-role">Livestock Production Officer</p>
                  <p className="team-bio">
                      Provides expert care and health checks for the company’s collateral livestock, oversees all animal health services, and offers farmers guidance on best practices for effective livestock management.
                  </p>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-5 bg-primary text-white">
        <div className="container">
          <div className="row justify-content-center text-center">
            <div className="col-lg-8">
              <h2 className="display-5 fw-bold mb-4">Ready to Transform Your Livestock into Opportunities?</h2>
              <p className="lead mb-4">
                Join thousands of satisfied clients who have trusted Nagolie with their financial needs.
              </p>
              <div className="d-flex justify-content-center gap-3 flex-wrap">
                <a href="/#loan-application" className="btn btn-light btn-lg px-4">
                  Submit Livestock Offer
                </a>
                <a href="/#contact" className="btn btn-outline-light btn-lg px-4">
                  Contact Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default About