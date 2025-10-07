"use client"

import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"

function About() {
  return (
    <div>
      <Navbar />

      {/* About Hero Section */}
      <section className="about-hero-section py-5 mt-5">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-8 mx-auto text-center">
              <h1 className="display-4 fw-bold mb-4 text-primary">About Nagolie Enterprises</h1>
              <p className="lead mb-4">Pioneering livestock-backed financial solutions in Kajiado County</p>
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
                A trusted financial partner in Isinya, Kajiado County, specializing exclusively in innovative
                livestock-backed lending solutions.
              </p>
              <p className="mb-4">
                At Nagolie Enterprises, we understand the central role that livestock plays in the livelihoods of our
                community. We provide quick, reliable financial services that recognize and respect the true value of
                your livestock. Our professional valuation process ensures fair and transparent lending terms, while our
                streamlined approach guarantees you access to funds when you need them most.
              </p>
              <p className="mb-4">
                Built on the pillars of <strong>integrity, transparency, and efficiency</strong>, we are committed to
                empowering livestock owners with financial solutions that inspire trust and deliver results. With
                Nagolie, you don't just get a loan — you gain a dependable partner dedicated to supporting your growth
                and stability.
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
                    <p className="text-muted">Loans Disbursed</p>
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
                  To provide accessible, livestock-backed financial solutions that empower rural communities, strengthen
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
                  To be the most trusted livestock-collateral lending institution, fostering sustainable economic
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
                  <img src="/user-image.png" alt="CEO - Nagolie Enterprises" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="#" className="social-link">
                        <i className="fab fa-linkedin"></i>
                      </a>
                      <a href="#" className="social-link">
                        <i className="fab fa-twitter"></i>
                      </a>
                      <a href="#" className="social-link">
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
                  <img src="/user-image.png" alt="livestock Valuer" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="#" className="social-link">
                        <i className="fab fa-linkedin"></i>
                      </a>
                      <a href="#" className="social-link">
                        <i className="fab fa-twitter"></i>
                      </a>
                      <a href="#" className="social-link">
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
                    lending terms for all clients.
                  </p>
                </div>
              </div>
            </div>

            {/* Technical Operations Manager */}
            <div className="col-lg-4 col-md-6 mb-5">
              <div className="team-card">
                <div className="team-image">
                  <img src="/user-image.png" alt="Head of IT" className="img-fluid" />
                  <div className="team-overlay">
                    <div className="team-social">
                      <a href="#" className="social-link">
                        <i className="fab fa-linkedin"></i>
                      </a>
                      <a href="#" className="social-link">
                        <i className="fab fa-twitter"></i>
                      </a>
                      <a href="#" className="social-link">
                        <i className="fas fa-envelope"></i>
                      </a>
                    </div>
                  </div>
                </div>
                <div className="team-info">
                  <h4 className="team-name">Joseph Ngugi</h4>
                  <p className="team-role">Technical Operation Manager</p>
                  <p className="team-bio">
                    Head of IT Operations, responsible for managing the Company's systems, ensuring smooth performance,
                    and fulfilling all company IT needs.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Support Team */}
          <div className="row justify-content-center">
            {/* Finance Officer */}
            <div className="col-lg-3 col-md-6 mb-4">
              <div className="team-card team-card-sm">
                <div className="team-image">
                  <img src="/user-image.png" alt="Finance Officer" className="img-fluid" />
                </div>
                <div className="team-info">
                  <h5 className="team-name">Beatrice Ivy</h5>
                  <p className="team-role">Finance Officer</p>
                </div>
              </div>
            </div>

            {/* Customer Relations */}
            <div className="col-lg-3 col-md-6 mb-4">
              <div className="team-card team-card-sm">
                <div className="team-image">
                  <img src="/user-image.png" alt="Customer Relations" className="img-fluid" />
                </div>
                <div className="team-info">
                  <h5 className="team-name">Michael Davies</h5>
                  <p className="team-role">Customer Relations</p>
                </div>
              </div>
            </div>

            {/* Field Agent */}
            <div className="col-lg-3 col-md-6 mb-4">
              <div className="team-card team-card-sm">
                <div className="team-image">
                  <img src="/user-image.png" alt="Field Agent" className="img-fluid" />
                </div>
                <div className="team-info">
                  <h5 className="team-name">James Lemayian</h5>
                  <p className="team-role">Field Agent</p>
                </div>
              </div>
            </div>

            {/* Marketing */}
            <div className="col-lg-3 col-md-6 mb-4">
              <div className="team-card team-card-sm">
                <div className="team-image">
                  <img src="/user-image.png" alt="Marketing Officer" className="img-fluid" />
                </div>
                <div className="team-info">
                  <h5 className="team-name">Lucy Akinyi</h5>
                  <p className="team-role">Marketing Officer</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
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
                  Apply for Loan
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
