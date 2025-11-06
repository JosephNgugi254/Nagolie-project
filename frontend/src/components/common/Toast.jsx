import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const showToast = {
  success: (message, duration = 5000) => toast.success(message, { autoClose: duration }),
  error: (message, duration = 5000) => toast.error(message, { autoClose: duration }),
  warning: (message, duration = 5000) => toast.warning(message, { autoClose: duration }),
  info: (message, duration = 5000) => toast.info(message, { autoClose: duration }),
};

function Toast() {
  return (
    <ToastContainer
      position="top-center"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick={true}
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
      // Ensure these props are set for close button functionality
      closeButton={true}
      enableMultiContainer={false}
      style={{
        zIndex: 9999,
      }}
      // Remove custom className overrides that might interfere with functionality
    />
  );
}

export default Toast;