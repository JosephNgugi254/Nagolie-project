"use client"

import { Link } from "react-router-dom"
import { motion, useInView } from "framer-motion"
import { useRef, useState, useEffect } from "react"
import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"
import SEO from '../components/common/SEO'

import { CountUp as CountUpCore } from 'countup.js';

const CountUp = ({ end, duration, suffix, prefix, ...rest }) => {
  const ref = useRef(null);
  const instance = useRef(null);

  useEffect(() => {
    if (ref.current) {
      instance.current = new CountUpCore(ref.current, end, {
        duration,
        suffix: suffix || '',
        prefix: prefix || '',
        ...rest,
      });
      if (!instance.current.error) {
        instance.current.start();
      }
    }
    return () => {
      if (instance.current) {
        instance.current.reset();
      }
    };
  }, [end, duration, suffix, prefix, rest]);

  return <span ref={ref}>0</span>;
};

// ---------- TypewriterRole Component ----------
const TypewriterRole = ({ role }) => {
  const [displayedText, setDisplayedText] = useState("")
  const [index, setIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 }) // triggers when 50% visible

  useEffect(() => {
    if (isInView && !hasStarted) {
      setHasStarted(true)
      setIndex(0)
      setDisplayedText("")
      setIsComplete(false)
    }
  }, [isInView, hasStarted])

  useEffect(() => {
    if (!hasStarted) return
    if (index < role.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + role[index])
        setIndex(prev => prev + 1)
      }, 80) // same speed as homepage
      return () => clearTimeout(timeout)
    } else if (!isComplete) {
      setIsComplete(true)
    }
  }, [index, role, hasStarted, isComplete])

  return (
    <p className="team-role" ref={ref}>
      {displayedText}
      {!isComplete && hasStarted && (
        <span
          style={{
            display: "inline-block",
            width: "3px",
            backgroundColor: "currentColor",
            marginLeft: "4px",
            animation: "blink 1s step-end infinite"
          }}
        >
          |
        </span>
      )}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </p>
  )
}

// ---------- Main About Component ----------
function About() {
  const statsRef = useRef(null)
  const isStatsInView = useInView(statsRef, { once: true, amount: 0.3 })

  const teamMembers = [
    {
      name: "Shadrack Kesumet",
      role: "Director and Founder",
      bio: "He has a deep understanding of rural financial needs and brings an ambitious, problem-solving mentality to every challenge.",
      image: "/mrdirector.png",
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
      role: "Senior Livestock Valuer & Recovery Officer",
      bio: "Expert in livestock valuation and local market dynamics, ensuring accurate assessments and fair purchase terms for all clients.",
      image: "/george1.jpeg",
      whatsapp: "https://wa.me/254703994290",
      email: "georgemarite@gmail.com"
    },
    {
      name: "Gladys Sakinoi",
      role: "Secretary",
      bio: "Coordinates schedules and communications, manages administrative and clerical tasks, and ensures smooth day-to-day office operations while supporting the entire team at Nagolie Enterprises Ltd.",
      image: "/Glado.png",
      whatsapp: "https://wa.me/0727635515",
      email: "sakinoigladys@gmail.com"
    },
    {
      name: "Ann Ndura",
      role: "Client Relations Officer",
      bio: "Facilitates client onboarding, portfolio management, and loan follow-ups while ensuring strong customer relationships and effective communication throughout the lending process.",
      image: "/ann-ndura.png",
      whatsapp: "https://wa.me/0727320067",
      email: "ndurah67@gmail.com"
    },
    {
      name: "Lucy Nyambura",
      role: "Client Relations Officer",
      bio: "Oversees client engagement and portfolio monitoring, providing timely support, payment follow-ups, and accurate reporting to enhance operational efficiency and client satisfaction.",
      image: "/lucy-nyambura.png",
      whatsapp: "https://wa.me/0706411713",
      email: "lucienyambura19@gmail.com"
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
      name: "Terry Kintei",
      role: "Human Resource Manager",
      bio: "Responsible for overseeing recruitment, staff welfare, and organizational development to ensure efficient and motivated workforce operations at Nagolie Enterprises Ltd.",
      image: "./Terry.png",
      whatsapp: "https://wa.me/24717167762",
      email: "terrykintei02@gmail.com"
    },
    {
      name: "Brian Ouko",
      role: "Advocate of the High Court",
      bio: "Provides legal representation and advocacy services for Nagolie Enterprises Ltd, while offering legal guidance on matters relating to the Company's operations, agreements, and recovery proceedings.",
      image: "/Brian.png",
      whatsapp: "https://wa.me/0716527642",
      email: "brianouko.m.m@gmail.com",
      linkedin: "https://www.linkedin.com/in/brian-ouko-942230176/"
    },
    {
      name: "Tait Lesiamon",
      role: "Legal Consultant",
      bio: "Provides legal guidance, ensures compliance with all regulatory requirements, and protects the interests of Nagolie Enterprises Ltd and its clients in every transaction.",
      image: "/Timothy.png",
      whatsapp: "https://wa.me/0725700487",
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
      role: "Livestock Valuer & Recovery Officer",
      bio: "Livestock Valuer leading our Emarti branch providing accurate and fair assessments for loans and purchases.",
      image: "/kalama-valuer-emarti.jpeg",
      whatsapp: "https://wa.me/+254711744388",
      email: "robertkalama505@gmail.com"
    }
  ]

  const mvvItems = [
    { icon: "bullseye", title: "Our Mission", text: "To provide accessible, financial solutions that empower rural communities, strengthen livelihoods, and drive agricultural growth across Kenya." },
    { icon: "eye", title: "Our Vision", text: "To become a leading livestock-backed lending partner, driving sustainable economic development through innovation and reliability." },
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
              <h1 className="display-4 fw-bold mb-4 text-primary">About Nagolie Enterprises Ltd</h1>
              <p className="lead mb-4">Expanding access to finance through livestock-backed lending in Kajiado County and across Kenya</p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* About Content Section (unchanged) */}
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
                Your trusted partner for accessing finance using livestock as collateral in Isinya, Kajiado County.
              </p>
              <p className="mb-4">
                 At Nagolie Enterprises Ltd, we understand that livestock is more than an asset. 
                 For many families and farmers, it is a source of income, food security, 
                 business capital, and long-term financial stability. Our livestock-backed 
                 lending model enables eligible livestock owners to access financing while 
                 retaining their productive assets.
              </p>
              <p className="mb-4">
                Built on the principles of <strong>integrity, transparency, responsibility, 
                and efficiency</strong>, Nagolie Enterprises Ltd is committed to developing 
                a responsible livestock-backed lending ecosystem that supports farmers, 
                strengthens rural livelihoods, and contributes to sustainable agricultural 
                growth.
              </p>
              <p className="mb-4">
                We believe that accessing capital should not necessarily mean disposing of 
                productive assets. With Nagolie, livestock owners can use the value of their 
                livestock to unlock financial opportunities for education, medical needs, 
                business expansion, farm inputs, and other important needs while continuing 
                to build their livelihoods.
              </p>
              <p className="mb-4">
                Through professional livestock valuation, client assessment, and transparent 
                lending terms, we determine the appropriate financing based on the value and 
                suitability of the livestock provided as collateral. Our goal is to make 
                financing more accessible to livestock owners who may otherwise have limited 
                access to conventional credit.
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
                  src="/nagolie-logo-without-bg.png"
                  alt="Nagolie Enterprises Ltd Logo"
                  className="img-fluid rounded shadow"
                  width="500"
                  height="400"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Mission, Vision, Values (unchanged) */}
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

      {/* Team Section with Typewriter Roles */}
      <motion.section
        id="team"
        className="py-5 bg-light"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="display-4 fw-bold mb-3">Meet Our Team</h2>
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
                    {/* Replace static role with TypewriterRole */}
                    <TypewriterRole role={member.role} />
                    <p className="team-bio">{member.bio}</p>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Call to Action Section (unchanged) */}
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
                  Apply for a Loan
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