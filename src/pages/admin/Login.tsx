import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { Form, Button, Container, Image, InputGroup } from 'react-bootstrap';
import { auth } from '../../config/firebase';
import { authService } from '../../services/authService';
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaSignInAlt } from 'react-icons/fa';
import { motion } from 'framer-motion';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Set persistent login
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error('Error setting persistence:', error);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      const result = await authService.verify(idToken);
      if (!result.admin) {
        await signOut(auth);
        setError('This account does not have admin access.');
        setLoading(false);
        return;
      }

      toast.success('Login successful!');
      navigate('/admin/dashboard');
    } catch (cause: unknown) {
      const error = cause as { code?: string; message?: string };
      console.error('Login error:', error.code, error.message);
      
      // Better error handling with user-friendly messages
      switch (error.code) {
        case 'auth/invalid-credential':
          setError('Invalid email or password. Please check your credentials and try again.');
          break;
        case 'auth/user-not-found':
          setError('No account found with this email address.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password. Please try again.');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed login attempts. Please try again later or reset your password.');
          break;
        case 'auth/network-request-failed':
          setError('Network error. Please check your internet connection and try again.');
          break;
        default:
          setError('Login failed. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  return (
    <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="login-container p-4 p-md-5"
        style={{ 
          width: '100%', 
          maxWidth: '450px', 
          borderRadius: '15px', 
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          backgroundColor: 'white'
        }}
      >
        <div className="text-center mb-4 rounded-9">
          <Image 
            src="https://res.cloudinary.com/dlkejgkqk/image/upload/v1752678018/logo_skiner.png"
            alt="Maoki House" 
            style={{ width: '180px', marginBottom: '1rem' }}
          />
          <h2 className="font-display fw-bold" style={{ color: 'var(--color-primary)' }}>Admin Login</h2>
          <p className="text-muted">Enter your credentials to access the admin area</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="alert alert-danger" 
            role="alert"
          >
            {error}
          </motion.div>
        )}

        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-4">
            <Form.Label className="fw-semibold">Email address</Form.Label>
            <InputGroup>
              <InputGroup.Text style={{ backgroundColor: '#f8f9fa', borderColor: '#dee2e6' }}>
                <FaEnvelope color="var(--color-primary)" />
              </InputGroup.Text>
              <Form.Control
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                aria-label="Email"
                required
                style={{ borderLeft: 0 }}
              />
            </InputGroup>
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="fw-semibold">Password</Form.Label>
            <InputGroup>
              <InputGroup.Text style={{ backgroundColor: '#f8f9fa', borderColor: '#dee2e6' }}>
                <FaLock color="var(--color-primary)" />
              </InputGroup.Text>
              <Form.Control
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                aria-label="Password"
                required
                style={{ borderLeft: 0, borderRight: 0 }}
              />
              <InputGroup.Text 
                onClick={togglePasswordVisibility}
                style={{ cursor: 'pointer', backgroundColor: '#f8f9fa', borderColor: '#dee2e6' }}
              >
                {showPassword ? <FaEyeSlash color="var(--color-primary)" /> : <FaEye color="var(--color-primary)" />}
              </InputGroup.Text>
            </InputGroup>
          </Form.Group>

          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              type="submit"
              disabled={loading}
              className="w-100 py-2 mt-3 d-flex align-items-center justify-content-center"
              style={{ 
                backgroundColor: 'var(--color-primary)',
                borderColor: 'var(--color-primary)',
                fontSize: '1.1rem',
                fontWeight: '500'
              }}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Signing in...
                </>
              ) : (
                <>
                  <FaSignInAlt className="me-2" /> Sign In
                </>
              )}
            </Button>
          </motion.div>

          <div className="text-center mt-4">
            <p className="text-muted small">
              Having trouble? Contact your administrator.
            </p>
          </div>
        </Form>

        <style>
          {`
          .login-container {
            transition: all 0.3s ease;
          }
          
          .form-control:focus, .input-group-text:focus {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 0.25rem rgba(130, 74, 57, 0.25);
          }
          `}
        </style>
      </motion.div>
    </Container>
  );
};

export default Login; 