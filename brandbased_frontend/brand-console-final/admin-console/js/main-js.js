// Splash on load
window.addEventListener('load', () => {
  const splash = document.querySelector('.screen-splash');
  const appInterface = document.querySelector('.app-interface');

  // Start the fade-out after 2 seconds
  setTimeout(() => {
    splash.classList.add('fade-out');

    // After fade transition completes (1 second), hide the splash and show app
    setTimeout(() => {
      splash.style.display = 'none'; // Fully hide the splash screen

      // Make the app interface visible
      appInterface.style.display = 'block';
    }, 50); // Matches fade-out duration
  }, 800); // Waits 2 seconds before starting fade
});




//theme color change in dark mode
function setThemeColor() {
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  
  // Remove the existing meta tag and re-add it to trigger recalculation
  if (metaThemeColor) {
    metaThemeColor.parentNode.removeChild(metaThemeColor);
  }
  
  metaThemeColor = document.createElement('meta');
  metaThemeColor.setAttribute('name', 'theme-color');
  
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    metaThemeColor.setAttribute('content', '#192229'); // Dark mode color
  } else {
    metaThemeColor.setAttribute('content', '#102ff5'); // Light mode color
  }

  document.head.appendChild(metaThemeColor);
}

// Set theme color on page load
setThemeColor();

// Listen for changes in the color scheme
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setThemeColor);





//Launch Screen - 1 - Screen 2 after 'Continue' to home screen
function CloseScreen1() {
  document.getElementById("OTP-and-App-popup-after-login").style.display = "none";
  document.getElementById("screen1").style.display = "none";
  document.getElementById("screen2").style.display = "flex";
  document.getElementById("console-desktop-footer-bar").style.display = "flex";
  document.getElementById("screen3").style.display = "none";
}

//Signup Form popup
function OpenJoinForm() {
  document.getElementById("join-form").style.display = "block";
  document.getElementById("buttons-hide").style.display = "none";
  document.getElementById("slogan").style.display = "none";
  document.getElementById("login-form").style.display = "none";
  document.getElementById("footer-tag").style.display = "none";
}
//Close Signup Form popup
function ClosenJoinForm() {
  document.getElementById("join-form").style.display = "none";
  document.getElementById("buttons-hide").style.display = "flex";
  document.getElementById("slogan").style.display = "block";
  document.getElementById("footer-tag").style.display = "block";
}

//Swap Signup Form and Open Login form
function SwapToLoginForm() {
  document.getElementById("join-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
  document.getElementById("login").style.display = "block";
  document.getElementById("footer-tag").style.display = "none";
  document.getElementById("send-new-passcode").style.display = "none";
}

//Login Form popup
function OpenLoginForm() {
  document.getElementById("login-form").style.display = "block";
  document.getElementById("join-form").style.display = "none";
  document.getElementById("buttons-hide").style.display = "none";
  document.getElementById("slogan").style.display = "none";
  document.getElementById("footer-tag").style.display = "none";
}
//Close Login Form popup
function CloseLoginForm() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("buttons-hide").style.display = "flex";
  document.getElementById("slogan").style.display = "block";
  document.getElementById("footer-tag").style.display = "block";
}

//Swap Login Form and Open Signup form
function SwapToJoinForm() {
  document.getElementById("join-form").style.display = "block";
  document.getElementById("login-form").style.display = "none";
  document.getElementById("footer-tag").style.display = "none";
}







//Show OTP Popup
function ShowOTPPopup() {
  document.getElementById("OTP-and-App-popup-after-login").style.display = "flex";
  document.getElementById("join-form").style.display = "none";
  document.getElementById("buttons-hide").style.display = "none";
  document.getElementById("slogan").style.display = "none";
  document.getElementById("login-form").style.display = "none";
  document.getElementById("footer-tag").style.display = "none";
}


//Show OTP Field
function ShowOTPField() {
  document.getElementById("dispaly-otp-field").style.display = "flex";
  document.getElementById("otp-code-entry-field").style.display = "flex";
  document.getElementById("continue-to-app").style.display = "flex";
  document.getElementById("hide-phone-and-get-code-button").style.display = "none";
  document.getElementById("get-code-heading").style.display = "none";
  document.getElementById("sent-otp-again-heading").style.display = "none";
}

//Did not get OTP Code send agagin
function SendOTPAgain() {
  const msg = document.getElementById("sent-otp-again-heading");
  const getCode = document.getElementById("get-code-heading");  

  // Hide get-code heading
  getCode.style.display = "none";

  // Hide message first to reset animation/visibility
  msg.style.display = "none";

  // Small delay before showing message again
  setTimeout(() => {
    msg.style.display = "flex";
  }, 50);

  // Optional: hide message again after 3 seconds so it can flash next time
  setTimeout(() => {
    msg.style.display = "none";
  }, 3000);
}






//When user is logged in we always show the Enter passcode sceren however if they have forgot their passcode we email them new one usin this js when they click 'Get New Passcode'
function FogotPasscode() {
  document.getElementById("send-new-passcode").style.display = "block";
  document.getElementById("login").style.display = "none";
}

//Sent new passcode on login - when user clicks 'Send New Passcode' this display login passcode input field once more
function SentNewPasscode() {
  document.getElementById("sent-new-passcode").style.display = "block";
  document.getElementById("login").style.display = "block";
  document.getElementById("footer-tag").style.display = "none";
  document.getElementById("send-new-passcode").style.display = "none";
  document.getElementById("hide-popup-link").style.display = "none";
}










//brandbased demo version of brand script
function enableBrandBasedEnhancement() {
  const container = document.body; // Changed from .text-content

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);

  const brandBasedRegex = /\b(BrandBased)\b/gi;
  const replacementHTML = `<img class="bb-replace" src="./images/BB-TYPEFACE-LOGO-white.svg" alt="BrandBased" style="height: 1em; vertical-align: top;">`;

  let node;
  while ((node = walker.nextNode())) {
    if (brandBasedRegex.test(node.nodeValue)) {
      const span = document.createElement('span');
      span.innerHTML = node.nodeValue.replace(brandBasedRegex, replacementHTML);
      node.parentNode.replaceChild(span, node);
    }
  }
}

document.addEventListener("DOMContentLoaded", enableBrandBasedEnhancement);






//footer nav slide up on toggle of #open-footer-nav

document.addEventListener('DOMContentLoaded', () => {
  const footerNav = document.querySelector('.mobile-footer-nav');
  const openFooterNav = document.getElementById('open-footer-nav');
  const closeMobileNav = document.querySelector('.close-mobile-nav');

  // Slide up
  openFooterNav.addEventListener('click', () => {
    footerNav.classList.add('active'); // slide up
    closeMobileNav.classList.remove('minus'); // show ✕
  });

  // Slide down
  closeMobileNav.addEventListener('click', () => {
    footerNav.classList.remove('active'); // slide down
    closeMobileNav.classList.add('minus'); // rotate ✕ to –
  });
});