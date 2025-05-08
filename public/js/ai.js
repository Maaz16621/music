 // Show Welcome Modal on Page Load
 window.addEventListener("DOMContentLoaded", () => {
  const welcomeModal = new bootstrap.Modal(document.getElementById('welcomeModal'));
  welcomeModal.show();
});