"use client"

import { Link } from "react-router-dom"
import { motion, useInView } from "framer-motion"
import { useRef, useState } from "react"
import CountUp from "react-countup"
import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"
import SEO from '../components/common/SEO'

function About() {
  const statsRef = useRef(null)
  const isStatsInView = useInView(statsRef, { once: true, amount: 0.3 })

  const teamMembers = [
    {
      name: "Shadrack Kesumet",
      role: "Chief Executive Officer and Founder",
      bio: "He has a deep understanding of rural financial needs and brings an ambitious, problem-solving mentality to every challenge.",
      image: "/Shaddy CEO.png",
      whatsapp: "https://wa.me/254721451707",
      email: "kesumetshadrack@gmail.com"
    },
    {
      name: "Millicent Mantaine",
      role: "Deputy Director",
      bio: "She works closely with the Director to drive the organization's vision, providing strategic support and ensuring efficient operations",
      image: "/Milly.jpeg",
      whatsapp: "https://wa.me/",
      email: ""
    },
    {
      name: "George Marite",
      role: "Senior Livestock Valuer",
      bio: "Expert in livestock valuation and local market dynamics, ensuring accurate assessments and fair purchase terms for all clients.",
      image: "/george1.jpeg",
      whatsapp: "https://wa.me/254703994290",
      email: "georgemarite@gmail.com"
    },
    {
      name: "Florence Wacuka",
      role: "Secretary",
      bio: "Coordinates schedules and communications, manages administrative and clerical tasks, and ensures smooth day-to-day office operations while supporting the entire team at Nagolie Enterprises.",
      image: "/flo.png",
      whatsapp: "https://wa.me/0722370124",
      email: ""
    },
    {
      name: "Joseph Ngugi",
      role: "Technical Operations Manager",
      bio: "Head of IT Operations, responsible for managing the Company's systems, ensuring smooth performance, and fulfilling all company IT needs.",
      image: "/solitary.png",
      whatsapp: "https://wa.me/254797644034",
      email: "solitaryjoe069@gmail.com",
      linkedin: "www.linkedin.com/in/joseph-ngugi-2a78991b7"
    },
    {
      name: "Tait Lesiamon",
      role: "Legal Consultant",
      bio: "Provides expert legal guidance, ensures compliance with all regulatory requirements, and protects the interests of Nagolie Enterprises and its clients in every transaction.",
      image: "/Timothy.png",
      whatsapp: "https://wa.me/",
      email: ""
    },
    {
      name: "Joshua Partapipi",
      role: "Livestock Production Officer",
      bio: "Provides expert veterinary care and health checks for the company's collateral livestock, oversees all animal health services, and offers farmers guidance on best practices for effective livestock management.",
      image: "./Joshua.png",
      whatsapp: "https://wa.me/",
      email: ""
    },
    {
      name: "Robert Kalama",
      role: "Livestock Valuer",
      bio: "Livestock Valuer leading our Emarti branch providing accurate and fair assessments for loans and purchases.",
      image: "/kalama-valuer-emarti.jpeg",
      whatsapp: "https://wa.me/+254711744388",
      email: ""
    }
  ]

  const mvvItems = [
    { icon: "bullseye", title: "Our Mission", text: "To provide accessible, financial solutions that empower rural communities, strengthen livelihoods, and drive agricultural growth across Kenya." },
    { icon: "eye", title: "Our Vision", text: "To become the premier livestock acquisition partner, driving sustainable economic development through innovation and reliability." },
    { icon: "heart", title: "Our Values", text: "Integrity, transparency, respect for livestock owners, and a firm commitment to efficiency, fairness, and supporting rural prosperity." }
  ]

  return (
    <div>
      <SEO 
        title="About Nagolie - Livestock Lending in Kajiado County"
        description="Learn about Nagolie's mission to provide livestock-backed financing solutions to farmers in Kajiado County and across Kenya."
        keywords="about Nagolie, livestock lending Kenya, Kajiado agricultural financing, our mission, farming community support"
      />
      <Navbar />

      {/* About Hero Section */}
      <motion.section
        className="about-hero-section py-5 mt-5"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-8 mx-auto text-center">
              <h1 className="display-4 fw-bold mb-4 text-primary">About Nagolie Enterprises</h1>
              <p className="lead mb-4">Revolutionizing direct livestock acquisitions in Kajiado County</p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* About Content Section */}
      <motion.section
        className="py-5"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.7 }}
      >
        <div className="container">
          <div className="row align-items-center">
            {/* About Text */}
            <motion.div
              className="col-lg-6 mb-5"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
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
            </motion.div>

            {/* About Image */}
            <motion.div
              className="col-lg-6"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="about-image">
                <img
                  src="/logo.png"
                  alt="Nagolie Enterprises"
                  className="img-fluid rounded shadow"
                  width="500"
                  height="400"
                />
              </div>
            </motion.div>
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
            {mvvItems.map((item, idx) => (
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

      {/* Team Section */}
      <motion.section
        id="team"
        className="py-5 bg-light"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="display-4 fw-bold mb-3">Meet Our Leadership Team</h2>
            <p className="lead text-muted">The passionate individuals driving Nagolie's mission forward</p>
          </div>

          <div className="row justify-content-center">
            {teamMembers.map((member, index) => (
              <motion.div
                key={index}
                className="col-lg-4 col-md-6 mb-5"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <motion.div 
                  className="team-card"
                  whileHover={{ y: -8, boxShadow: "0 15px 35px rgba(0,0,0,0.15)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <div className="team-image">
                    <img src={member.image} alt={member.name} className="img-fluid" />
                    <div className="team-overlay">
                      <div className="team-social">
                        {member.linkedin && (
                          <a href={member.linkedin} className="social-link" target="_blank" rel="noopener noreferrer">
                            <i className="fab fa-linkedin"></i>
                          </a>
                        )}
                        {member.whatsapp && (
                          <a href={member.whatsapp} className="social-link" target="_blank" rel="noopener noreferrer">
                            <i className="fab fa-whatsapp"></i>
                          </a>
                        )}
                        {member.email && (
                          <a href={`mailto:${member.email}`} className="social-link">
                            <i className="fas fa-envelope"></i>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="team-info">
                    <h4 className="team-name">{member.name}</h4>
                    <p className="team-role">{member.role}</p>
                    <p className="team-bio">{member.bio}</p>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Call to Action Section */}
      <motion.section
        className="py-5 bg-primary text-white"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
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
      </motion.section>

      <Footer />
    </div>
  )
}

export default About