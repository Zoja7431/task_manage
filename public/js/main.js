document.addEventListener('DOMContentLoaded', () => {
  console.log('main.js loaded');
  const logoutForm = document.querySelector('form[action="/logout"]');
  if (logoutForm) {
    logoutForm.addEventListener('submit', (e) => {
      console.log('Logout form submitted');
    });
  }
});