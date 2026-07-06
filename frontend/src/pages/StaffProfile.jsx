// frontend/src/pages/StaffProfile.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Mapping staff number → image URL (same as About page)
const staffImages = {
  'NAG-EMP-0001': '/mrdirector.png',           // Shadrack
  'NAG-EMP-0002': '/solitary.png',            // Joseph Ngugi
  'NAG-EMP-0003': '/george1.jpeg',            // George Marite
  'NAG-EMP-0004': '/Glado.png',               // Gladys Sakinoi
  'NAG-EMP-0005': '/ann-ndura.png',           // Ann Ndura
  'NAG-EMP-0006': '/lucy-nyambura.png',       // Lucy Nyambura
  'NAG-EMP-0007': '/kalama-valuer-emarti.jpeg', // Robert Kalama
  'NAG-EMP-0008': '/Terry.png',   // Terry Kintei
  'NAG-EMP-0009': '/Joshua.png',  // Joshua Partapipi
};

// Custom "Joined" display per staff number
const getJoinedDisplay = (staffNumber) => {
  if (staffNumber === 'NAG-EMP-0001') return '—';      // Director – founding member
  if (staffNumber === 'NAG-EMP-0002' || staffNumber === 'NAG-EMP-0003') return '2025';
  return '2026'; // Everyone else joined in 2026
};

const StaffProfile = () => {
  const { staffNumber } = useParams();
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/staff/${staffNumber}`)
      .then(res => {
        setStaff(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError('Staff member not found');
        setLoading(false);
      });
  }, [staffNumber]);

  // Shared layout wrapper for all states
  const PageLayout = ({ children }) => (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      <main
        className="flex-grow-1 d-flex align-items-center justify-content-center"
        style={{ paddingTop: '76px' }} // adjust to match your navbar height
      >
        <div className="container py-4">
          <div className="row justify-content-center">
            <div className="col-lg-6 col-md-8">
              {children}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="alert alert-danger text-center">{error}</div>
      </PageLayout>
    );
  }

  const profileImage = staffImages[staff.staff_number] || null;

  return (
    <PageLayout>
      <div className="card shadow-lg border-0 rounded-4 overflow-hidden">
        <div className="card-body p-5 text-center">
          {/* Circular profile image */}
          <div className="mb-4">
            {profileImage ? (
              <img
                src={profileImage}
                alt={staff.full_name}
                className="rounded-circle"
                width="140"
                height="140"
                style={{
                  objectFit: 'cover',
                  border: '4px solid var(--light-blue)',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                }}
              />
            ) : (
              <div
                className="rounded-circle bg-light d-inline-flex align-items-center justify-content-center"
                style={{
                  width: '140px',
                  height: '140px',
                  border: '4px solid var(--light-blue)',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                }}
              >
                <i className="fas fa-user fa-5x text-secondary" />
              </div>
            )}
          </div>

          <h3 className="card-title fw-bold">{staff.full_name}</h3>
          <p className="text-muted mb-2" style={{ fontSize: '1.1rem' }}>
            {staff.position}
          </p>
          <hr className="my-3" />
          <div className="row text-start">
            <div className="col-sm-6 mb-2">
              <strong>Staff No.</strong>
              <div>{staff.staff_number}</div>
            </div>
            <div className="col-sm-6 mb-2">
              <strong>Department</strong>
              <div>{staff.department}</div>
            </div>
            <div className="col-sm-6 mb-2">
              <strong>Status</strong>
              <span className={`badge ${staff.employment_status === 'Active' ? 'bg-success' : 'bg-secondary'} ms-2`}>
                {staff.employment_status}
              </span>
            </div>
            <div className="col-sm-6 mb-2">
              <strong>Joined</strong>
              {/* Custom display based on staff number */}
              <div>{getJoinedDisplay(staff.staff_number)}</div>
            </div>
          </div>
          <div className="mt-4">
            <span className="badge bg-primary" style={{ fontSize: '1rem', padding: '0.5rem 1.2rem' }}>
              <i className="fas fa-check-circle me-2" /> Verified Employee
            </span>
          </div>
        </div>
        <div className="card-footer bg-light text-muted text-center py-2 small">
          Nagolie Enterprises Ltd – Digital Verification
        </div>
      </div>
    </PageLayout>
  );
};

export default StaffProfile;