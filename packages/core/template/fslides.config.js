module.exports = {
  name: 'my-presentation',

  // Slide filenames in order, relative to the slides/ directory
  slides: [
    'index.html',
  ],

  // Human-readable labels for the overview panel (must match slides array length)
  labels: [
    'Title',
  ],

  // Optional: per-slide PDF overrides
  // pdfOverrides: {
  //   'my-animated-slide.html': {
  //     wait: 5000,   // extra ms to wait before capturing
  //     extra: `document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));`
  //   }
  // },
};
