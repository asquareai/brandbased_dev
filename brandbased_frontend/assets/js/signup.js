// ================= API CONFIG =================
const API_BASE_URL =
    (typeof BB_APP !== "undefined" && BB_APP.apiBaseUrl) ||
    "https://api.brandbased.ai/api";

const ROUTES =
    (typeof BB_APP !== "undefined" && BB_APP.routes) || {
        login: "index.html",
        landing: "landing.html",
        signout: "signout.html",
        console: "brand-console-final/brand-console-dashboard.html",
    };

const authState = {
    email: "",
    token: "",
    account: null
};
document.addEventListener("DOMContentLoaded", () => {
    const isLoggedIn = localStorage.getItem("is_logged_in");
    const token = localStorage.getItem("auth_token");

    if (isLoggedIn === "true" && token) {
        window.location.href = ROUTES.landing;
    }
});
async function apiPost(endpoint, payload) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(payload)
    });

    return await response.json();
}

// ================= VIDEO AUTOPLAY =================
document.addEventListener('DOMContentLoaded', () => {
    const video = document.querySelector('.video-bg');
    if (video) {
        video.play().catch(() => {});
    }
});

// ================= MOVING SUBTITLE =================
function setupMovingSubtitle(text1Selector, text2Selector) {
    const text1 = document.querySelector(text1Selector);
    const text2 = document.querySelector(text2Selector);

    if (!text1 || !text2) return;

    let current = 1;
    text1.classList.add('active');

    setInterval(() => {
        if (current === 1) {
            text1.classList.remove('active');
            text2.classList.add('active');
            current = 2;
        } else {
            text2.classList.remove('active');
            text1.classList.add('active');
            current = 1;
        }
    }, 4000);
}

setupMovingSubtitle('.desktop-text1', '.desktop-text2');
setupMovingSubtitle('.mobile-text1', '.mobile-text2');

// ================= STEP NAVIGATION =================
let stepHistory = [];

function goToStep(stepId) {
    const currentStep = document.querySelector(".auth-step.active");

    if (currentStep) {
        stepHistory.push(currentStep.id);
        currentStep.classList.remove("active");
    }

    const nextStep = document.getElementById(stepId);
    if (nextStep) {
        nextStep.classList.add("active");
    }
}

function goBack() {
    if (stepHistory.length === 0) return;

    const currentStep = document.querySelector(".auth-step.active");
    if (currentStep) currentStep.classList.remove("active");

    const prevStepId = stepHistory.pop();
    const prevStep = document.getElementById(prevStepId);

    if (prevStep) prevStep.classList.add("active");
}

function goToLanding() {
    window.location.href = ROUTES.landing;
}

// ================= ERROR HANDLING =================
function showError(stepId, message) {
    const step = document.getElementById(stepId);
    if (!step) return;

    let errorBox = step.querySelector(".auth-error");

    if (!errorBox) {
        errorBox = document.createElement("div");
        errorBox.className = "auth-error";

        const firstButton = step.querySelector("button");
        if (firstButton) {
            step.insertBefore(errorBox, firstButton);
        } else {
            step.appendChild(errorBox);
        }
    }

    errorBox.textContent = message;
    errorBox.style.display = "block";
}

function clearError(stepId) {
    const step = document.getElementById(stepId);
    if (!step) return;

    const errorBox = step.querySelector(".auth-error");
    if (errorBox) {
        errorBox.textContent = "";
        errorBox.style.display = "none";
    }
}

// ================= LOADING STATE =================
function setButtonLoading(stepId, isLoading, loadingText = "Please wait...") {
    const step = document.getElementById(stepId);
    if (!step) return;

    const button = step.querySelector("button");
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.innerText;
        button.innerText = loadingText;
        button.disabled = true;
        button.style.opacity = "0.7";
        button.style.cursor = "not-allowed";
    } else {
        button.innerText = button.dataset.originalText || button.innerText;
        button.disabled = false;
        button.style.opacity = "1";
        button.style.cursor = "pointer";
    }
}

// ================= BASIC VALIDATION HELPERS =================
function getEmailFromStep(stepId) {
    return document.querySelector(`#${stepId} input[type="email"]`)?.value.trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ================= SIGNUP API FLOW =================

// Step 1: Send signup OTP
async function sendSignupOtp(currentStepId, nextStepId) {
    clearError(currentStepId);

    const email = getEmailFromStep(currentStepId);

    if (!email) {
        showError(currentStepId, "Please enter your email address.");
        return;
    }

    if (!isValidEmail(email)) {
        showError(currentStepId, "Please enter a valid email address.");
        return;
    }

    try {
        setButtonLoading(currentStepId, true, "Sending OTP...");

        const data = await apiPost("/auth/signup/send-otp", {
            email: email
        });

        if (!data.status) {
            showError(currentStepId, data.message || "Unable to send OTP.");
            return;
        }

        authState.email = email;


        goToStep(nextStepId);

    } catch (error) {
        console.error(error);
        showError(currentStepId, "Server error. Please try again.");
    } finally {
        setButtonLoading(currentStepId, false);
    }
}

// Step 2: Verify signup OTP
async function verifySignupOtp(currentStepId, nextStepId) {
    clearError(currentStepId);

    const otp = document.querySelector(`#${currentStepId} input`)?.value.trim();

    if (!otp) {
        showError(currentStepId, "Please enter OTP.");
        return;
    }

    if (!/^\d{6}$/.test(otp)) {
        showError(currentStepId, "OTP must be 6 digits.");
        return;
    }

    if (!authState.email) {
        showError(currentStepId, "Email missing. Please start again.");
        return;
    }

    try {
        setButtonLoading(currentStepId, true, "Verifying...");

        const data = await apiPost("/auth/signup/verify-otp", {
            email: authState.email,
            otp: otp
        });

        if (!data.status) {
            showError(currentStepId, data.message || "OTP verification failed.");
            return;
        }

        goToStep(nextStepId);

    } catch (error) {
        console.error(error);
        showError(currentStepId, "Server error. Please try again.");
    } finally {
        setButtonLoading(currentStepId, false);
    }
}

// Step 3: Validate password and move to PIN choice
function validateSignupPassword(currentStepId, nextStepId) {
    clearError(currentStepId);

    const inputs = document.querySelectorAll(`#${currentStepId} input[type="password"]`);
    const password = inputs[0]?.value.trim();
    const confirmPassword = inputs[1]?.value.trim();

    if (!password || !confirmPassword) {
        showError(currentStepId, "Please enter password and confirm password.");
        return;
    }

    if (password.length < 6) {
        showError(currentStepId, "Password must be at least 6 characters.");
        return;
    }

    if (password !== confirmPassword) {
        showError(currentStepId, "Password and confirm password do not match.");
        return;
    }

    authState.password = password;
    authState.password_confirmation = confirmPassword;

    goToStep(nextStepId);
}

// Step 4A: Finish signup without PIN
async function finishSignupWithoutPin(currentStepId) {
    clearError(currentStepId);

    if (!authState.email || !authState.password) {
        showError(currentStepId, "Signup data missing. Please start again.");
        return;
    }

    try {
        setButtonLoading(currentStepId, true, "Creating account...");

        const data = await apiPost("/auth/signup/finish", {
            email: authState.email,
            password: authState.password,
            password_confirmation: authState.password_confirmation
        });

        if (!data.status) {
            showError(currentStepId, data.message || "Unable to create account.");
            return;
        }

        goToLanding();

    } catch (error) {
        console.error(error);
        showError(currentStepId, "Server error. Please try again.");
    } finally {
        setButtonLoading(currentStepId, false);
    }
}

// Step 4B: Finish signup with PIN
async function finishSignupWithPin(currentStepId) {
    clearError(currentStepId);

    const inputs = document.querySelectorAll(`#${currentStepId} input[type="password"]`);
    const pin = inputs[0]?.value.trim();
    const confirmPin = inputs[1]?.value.trim();

    if (!pin || !confirmPin) {
        showError(currentStepId, "Please enter PIN and confirm PIN.");
        return;
    }

    if (!/^\d{6}$/.test(pin)) {
        showError(currentStepId, "PIN must be exactly 6 digits.");
        return;
    }

    if (pin !== confirmPin) {
        showError(currentStepId, "PIN and confirm PIN do not match.");
        return;
    }

    if (!authState.email || !authState.password) {
        showError(currentStepId, "Signup data missing. Please start again.");
        return;
    }

    try {
        setButtonLoading(currentStepId, true, "Creating account...");

        const data = await apiPost("/auth/signup/finish", {
            email: authState.email,
            password: authState.password,
            password_confirmation: authState.password_confirmation,
            pin_code: pin
        });

        if (!data.status) {
            showError(currentStepId, data.message || "Unable to create account.");
            return;
        }

        goToLanding();

    } catch (error) {
        console.error(error);
        showError(currentStepId, "Server error. Please try again.");
    } finally {
        setButtonLoading(currentStepId, false);
    }
}

// ================= LOGIN API FLOW =================
async function loginAccount(currentStepId) {
    clearError(currentStepId);

    const email = document.querySelector(`#${currentStepId} input[type="email"]`)?.value.trim().toLowerCase();
    const password = document.querySelector(`#${currentStepId} input[type="password"]`)?.value.trim();

    if (!email) {
        showError(currentStepId, "Please enter your email address.");
        return;
    }

    if (!isValidEmail(email)) {
        showError(currentStepId, "Please enter a valid email address.");
        return;
    }

    if (!password) {
        showError(currentStepId, "Please enter your password.");
        return;
    }

    try {
        setButtonLoading(currentStepId, true, "Logging in...");

        const data = await apiPost("/auth/login", {
            email: email,
            password: password
        });

        if (!data.status) {
            showError(currentStepId, data.message || "Login failed.");
            return;
        }

        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("account", JSON.stringify(data.account));
        localStorage.setItem("is_logged_in", "true");
        localStorage.setItem("plan_type", data.account?.plan_type || "freemium");


        authState.token = data.token;
        authState.account = data.account;
        authState.plan_type = data.account?.plan_type || "freemium";
        // console.log("========== LOGIN SUCCESS ==========");
        // console.log("Auth Token:", data.token);
        // console.log("Account Object:", data.account);
        // console.log("Plan Type:", data.account?.plan_type || "freemium");

        // console.log("========== LOCAL STORAGE ==========");
        // console.log("auth_token:", localStorage.getItem("auth_token"));
        // console.log("account:", JSON.parse(localStorage.getItem("account")));
        // console.log("is_logged_in:", localStorage.getItem("is_logged_in"));
        // console.log("plan_type:", localStorage.getItem("plan_type"));

        // console.log("========== AUTH STATE ==========");
        // console.log("authState.token:", authState.token);
        // console.log("authState.account:", authState.account);
        // console.log("authState.plan_type:", authState.plan_type);

        goToLanding();

    } catch (error) {
        console.error(error);
        showError(currentStepId, "Server error. Please try again.");
    } finally {
        setButtonLoading(currentStepId, false);
    }
}

// ================= OLD VALIDATION FUNCTIONS - KEEPING FOR SAFETY =================
function validateEmailStep(currentStepId, nextStepId) {
    clearError(currentStepId);

    const email = getEmailFromStep(currentStepId);

    if (!email) {
        showError(currentStepId, "Please enter your email address.");
        return;
    }

    if (!isValidEmail(email)) {
        showError(currentStepId, "Please enter a valid email address.");
        return;
    }

    goToStep(nextStepId);
}

function validateOtpStep(currentStepId, nextStepId) {
    clearError(currentStepId);

    const otp = document.querySelector(`#${currentStepId} input`)?.value.trim();

    if (!otp) {
        showError(currentStepId, "Please enter OTP.");
        return;
    }

    if (!/^\d{6}$/.test(otp)) {
        showError(currentStepId, "OTP must be 6 digits.");
        return;
    }

    goToStep(nextStepId);
}

function validatePasswordStep(currentStepId, nextStepId) {
    validateSignupPassword(currentStepId, nextStepId);
}

function validatePinStep(currentStepId) {
    finishSignupWithPin(currentStepId);
}