// components/admin/AdminCompanyGallery.jsx

import { useState, useEffect, useCallback } from "react";
import Modal from "../common/Modal";
import ConfirmationDialog from "../common/ConfirmationDialog";
import Toast, { showToast } from "../common/Toast";
import { adminAPI } from "../../services/api";
import imageCompression from "browser-image-compression";
import { useDropzone } from 'react-dropzone';

const AdminCompanyGallery = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categories] = useState(["event", "operations", "services", "team"]);
  const [filterCategory, setFilterCategory] = useState("all");

  // Upload form state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("event");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingImage, setEditingImage] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");

  // Preview modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Delete single image confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageToDelete, setImageToDelete] = useState(null);

  // Bulk delete confirmation
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);

  const onDrop = useCallback((acceptedFiles) => {
    handleImageUpload({ target: { files: acceptedFiles } });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: 'image/*',
    multiple: true,
    disabled: imageUploading
  });

  // Fetch images
  const fetchImages = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getCompanyGallery();
      setImages(response.data);
    } catch (error) {
      showToast.error("Failed to load gallery images");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  // Filter images
  const filteredImages = filterCategory === "all"
    ? images
    : images.filter(img => img.category === filterCategory);

  // Image upload handlers
  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setImageUploading(true);
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };

      const compressedFiles = await Promise.all(
        files.map(file => imageCompression(file, options))
      );

      const photoPromises = compressedFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(file);
        });
      });

      const newImages = await Promise.all(photoPromises);
      setSelectedImages(prev => [...prev, ...newImages]);
    } catch (error) {
      console.error("Error compressing images:", error);
      showToast.error("Failed to process images");
    } finally {
      setImageUploading(false);
    }
  };

  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitUpload = async (e) => {
    e.preventDefault();
    if (!uploadTitle || selectedImages.length === 0) {
      showToast.error("Please enter a title and select at least one image");
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: selectedImages.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedImages.length; i++) {
      const img = selectedImages[i];
      try {
        await adminAPI.addCompanyGalleryImages({
          category: uploadCategory,
          title: uploadTitle,
          description: uploadDescription,
          date: uploadDate || undefined,
          images: [img],
        });
        successCount++;
        setUploadProgress({ current: successCount, total: selectedImages.length });
      } catch (error) {
        console.error(`Failed to upload image ${i + 1}:`, error);
        failCount++;
        showToast.error(`Failed to upload image ${i + 1}. Stopping.`);
        break;
      }
    }

    setUploading(false);

    if (failCount === 0) {
      showToast.success(`All ${successCount} images uploaded successfully!`);
      setShowUploadModal(false);
      setUploadCategory("event");
      setUploadTitle("");
      setUploadDescription("");
      setUploadDate("");
      setSelectedImages([]);
      fetchImages();
    } else {
      showToast.error(`Uploaded ${successCount} images, ${failCount} failed.`);
    }
  };

  // Single delete
  const handleDelete = (image) => {
    setImageToDelete(image);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!imageToDelete) return;
    try {
      await adminAPI.deleteCompanyGalleryImage(imageToDelete.id);
      showToast.success("Image deleted");
      // Remove from selected set if present
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageToDelete.id);
        return newSet;
      });
      fetchImages();
    } catch (error) {
      showToast.error("Delete failed");
    } finally {
      setShowDeleteConfirm(false);
      setImageToDelete(null);
    }
  };

  // Bulk delete
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setBulkDeleteCount(selectedIds.size);
    setShowBulkDeleteConfirm(true);
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredImages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredImages.map(img => img.id)));
    }
  };

  // Handle checkbox change
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const confirmBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => adminAPI.deleteCompanyGalleryImage(id))
      );
      showToast.success(`Deleted ${bulkDeleteCount} images`);
      setSelectedIds(new Set());
      fetchImages();
    } catch (error) {
      showToast.error("Failed to delete some images");
    }
  };

  return (
    <div className="content-section">
      <Toast />
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Company Gallery Management</h2>
        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
          <i className="fas fa-plus me-1"></i>Add Images
        </button>
      </div>

      {/* Filter tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${filterCategory === "all" ? "active" : ""}`}
            onClick={() => setFilterCategory("all")}
          >
            All
          </button>
        </li>
        {categories.map(cat => (
          <li className="nav-item" key={cat}>
            <button
              className={`nav-link ${filterCategory === cat ? "active" : ""}`}
              onClick={() => setFilterCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          </li>
        ))}
      </ul>

      {/* Bulk actions bar */}
      {filteredImages.length > 0 && (
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <button
              className="btn btn-sm btn-outline-secondary me-2"
              onClick={toggleSelectAll}
            >
              {selectedIds.size === filteredImages.length ? "Deselect All" : "Select All"}
            </button>
            {selectedIds.size > 0 && (
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={handleBulkDelete}
              >
                Delete Selected ({selectedIds.size})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Image grid */}
      {loading ? (
        <div className="text-center py-5">Loading...</div>
      ) : (
        <div className="row">
          {filteredImages.map(img => (
            <div key={img.id} className="col-md-4 col-lg-3 mb-4">
              <div className="card h-100">
                <div className="position-relative">
                  <img
                    src={img.thumbnail}
                    className="card-img-top"
                    alt={img.title}
                    style={{ height: "200px", objectFit: "cover", cursor: "pointer" }}
                    onClick={() => {
                      setPreviewImage(img);
                      setShowPreviewModal(true);
                    }}
                  />
                  <div className="position-absolute top-0 start-0 p-2">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={selectedIds.has(img.id)}
                      onChange={() => toggleSelect(img.id)}
                    />
                  </div>
                </div>
                <div className="card-body">
                  <h6 className="card-title">{img.title}</h6>
                  <p className="card-text small text-muted">{img.description}</p>
                  <p className="small">
                    <span className="badge bg-info">{img.category}</span>
                  </p>
                </div>
                <div className="card-footer bg-transparent d-flex justify-content-between">
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                      setEditingImage(img);
                      setEditCategory(img.category);
                      setEditTitle(img.title);
                      setEditDescription(img.description || "");
                      setEditDate(img.date || "");
                      setShowEditModal(true);
                    }}
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(img)}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredImages.length === 0 && (
            <div className="col-12 text-center py-5">
              <p className="text-muted">No images found.</p>
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <Modal
          isOpen={showUploadModal}
          onClose={() => {
            setShowUploadModal(false);
            setSelectedImages([]);
            setUploadTitle("");
            setUploadDescription("");
            setUploadDate("");
          }}
          title="Add Company Gallery Images"
          size="lg"
        >
          <form onSubmit={handleSubmitUpload}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Category *</label>
                <select
                  className="form-select"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  required
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Title *</label>
                <input
                  type="text"
                  className="form-control"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Description (optional)</label>
              <textarea
                className="form-control"
                rows="2"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Date (optional)</label>
              <input
                type="date"
                className="form-control"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Images *</label>
              <div
                {...getRootProps()}
                className={`dropzone p-4 border rounded text-center ${isDragActive ? 'border-primary bg-light' : ''}`}
                style={{ cursor: 'pointer', borderStyle: 'dashed' }}
              >
                <input {...getInputProps()} />
                {isDragActive ? (
                  <p>Drop the images here ...</p>
                ) : (
                  <p>Drag & drop images here, or click to select</p>
                )}
                <small className="text-muted d-block">You can select multiple images</small>
              </div>

              {selectedImages.length > 0 && (
                <div className="mt-3">
                  <label>Previews:</label>
                  <div className="row">
                    {selectedImages.map((img, idx) => (
                      <div key={idx} className="col-3 mb-2 position-relative">
                        <img
                          src={img}
                          alt={`preview-${idx}`}
                          className="img-thumbnail"
                          style={{ width: "100%", height: "80px", objectFit: "cover" }}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-sm position-absolute top-0 end-0"
                          onClick={() => removeImage(idx)}
                          style={{ transform: "translate(50%, -50%)" }}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="d-flex gap-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={uploading}
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                {uploading && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                      backgroundColor: '#28a745',
                      transition: 'width 0.3s ease',
                      zIndex: 1,
                    }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 2, color: '#fff' }}>
                  {uploading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                      Uploading {uploadProgress.current}/{uploadProgress.total}...
                    </>
                  ) : (
                    'Upload'
                  )}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedImages([]);
                  setUploadTitle("");
                  setUploadDescription("");
                  setUploadDate("");
                }}
                disabled={uploading}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && editingImage && (
        <Modal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingImage(null);
          }}
          title="Edit Image"
          size="md"
        >
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              await adminAPI.updateCompanyGalleryImage(editingImage.id, {
                category: editCategory,
                title: editTitle,
                description: editDescription,
                date: editDate || undefined,
              });
              showToast.success("Image updated");
              setShowEditModal(false);
              fetchImages();
            } catch (error) {
              showToast.error("Update failed");
            }
          }}>
            <div className="mb-3">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                required
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Title</label>
              <input
                type="text"
                className="form-control"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows="2"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-control"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary">Update</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Preview Modal */}
      {showPreviewModal && previewImage && (
        <Modal
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setPreviewImage(null);
          }}
          title={previewImage.title}
          size="lg"
        >
          <div className="text-center">
            <img
              src={previewImage.src}
              alt={previewImage.title}
              className="img-fluid"
              style={{ maxHeight: "80vh" }}
            />
          </div>
          <div className="mt-3">
            <p><strong>Category:</strong> {previewImage.category}</p>
            <p><strong>Description:</strong> {previewImage.description}</p>
            <p><strong>Date:</strong> {previewImage.date}</p>
          </div>
          <div className="d-flex justify-content-end">
            <button className="btn btn-secondary" onClick={() => setShowPreviewModal(false)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation (single) */}
      <ConfirmationDialog
          isOpen={showBulkDeleteConfirm}
          onClose={() => setShowBulkDeleteConfirm(false)}
          onConfirm={confirmBulkDelete}
          title="Delete Multiple Images"
          message={`Are you sure you want to delete ${bulkDeleteCount} selected image(s)? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmColor="danger"
        />
    </div>
  );
};

export default AdminCompanyGallery;