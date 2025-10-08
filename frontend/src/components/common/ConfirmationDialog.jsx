import Modal from "./Modal";

function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmColor = "danger",
  cancelColor = "secondary"
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
    >
      <div className="text-center">
        <div className="mb-4">
          <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
          <p className="mb-0">{message}</p>
        </div>
        
        <div className="d-flex gap-2 justify-content-center">
          <button
            className={`btn btn-${cancelColor}`}
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            className={`btn btn-${confirmColor}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmationDialog;