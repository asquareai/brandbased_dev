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

const resetPasswordState = {
    email: "",
};

const AUTH_POPUP_LOGO = "./assets/images/Brandbased-icon.svg";
const AUTH_POPUP_BAR = "#635bff";

function dismissAuthPopup() {
    try {
        document.querySelectorAll("body > .bb-sync-popup-backdrop").forEach(function (el) {
            el.classList.remove("bb-sync-popup-backdrop--show");
            window.setTimeout(function () {
                try {
                    el.remove();
                } catch (_e) { /* ignore */ }
            }, 220);
        });
    } catch (_e) { /* ignore */ }
}

/** Same progress-bar modal as brand verification (Meta / logo upload). */
function showAuthPopup(label, doneLabel, options) {
    options = options || {};
    if (typeof window.bbShowSyncPopup !== "function") {
        return Promise.resolve();
    }
    const result = window.bbShowSyncPopup({
        label: label,
        doneLabel: doneLabel,
        barColor: AUTH_POPUP_BAR,
        logoSrc: AUTH_POPUP_LOGO,
        duration: options.duration != null ? options.duration : 2800,
        doneHoldMs: options.doneHoldMs != null ? options.doneHoldMs : 1200,
        shineLabel: true,
    });
    if (result && typeof result.then === "function") {
        return result;
    }
    return Promise.resolve();
}

function setStepBusy(stepId, busy) {
    const step = document.getElementById(stepId);
    if (!step) return;
    const button = getActionButton(step);
    if (!button) return;
    button.disabled = !!busy;
    button.style.opacity = busy ? "0.65" : "1";
    button.style.cursor = busy ? "not-allowed" : "pointer";
}

document.addEventListener("DOMContentLoaded", () => {
    const isLoggedIn = localStorage.getItem("is_logged_in");
    const token = localStorage.getItem("auth_token");

    if (isLoggedIn === "true" && token) {
        window.location.href = ROUTES.landing;
    }
});
async function apiPost(endpoint, payload) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(payload)
        });
    } catch (networkError) {
        const err = new Error(
            "Cannot reach the API. Is Laravel running on port 8000?"
        );
        err.cause = networkError;
        throw err;
    }

    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (_parseError) {
            const err = new Error(
                response.ok
                    ? "Invalid response from server."
                    : `Server error (${response.status}).`
            );
            err.httpStatus = response.status;
            throw err;
        }
    }

    if (!data || typeof data !== "object") {
        data = {
            status: response.ok,
            message: response.ok ? "" : `Server error (${response.status}).`,
        };
    }

    if (!response.ok && data.status !== false) {
        data.status = false;
        if (!data.message) {
            data.message = `Request failed (${response.status}).`;
        }
    }

    data.httpStatus = response.status;
    return data;
}

// ================= VIDEO AUTOPLAY =================
document.addEventListener('DOMContentLoaded', () => {
    const video = document.querySelector('.video-bg');
    if (video) {
        video.play().catch(() => {});
    }

    document.querySelectorAll(".auth-inline-box .auth-step input").forEach((input) => {
        if (input.closest(".bb-glass-field")) return;
        const wrap = document.createElement("div");
        wrap.className = "bb-glass-field";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
    });

    bindForgotPasswordActions();
});

function bindForgotPasswordActions() {
    const actions = {
        "reset-password-send": (el) =>
            sendResetPasswordOtp(el.dataset.step, el.dataset.next),
        "reset-password-verify": (el) =>
            verifyResetPasswordOtp(el.dataset.step, el.dataset.next),
        "reset-password-update": (el) =>
            updateResetPassword(el.dataset.step, el.dataset.next),
    };

    document.querySelectorAll("[data-auth-action]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const handler = actions[btn.dataset.authAction];
            if (handler) handler(btn);
        });
    });
}

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
const mobileStepHistory = [];
const desktopStepHistory = [];

function stepHistoryFor(stepId) {
    if (String(stepId || "").startsWith("mobile-")) return mobileStepHistory;
    if (String(stepId || "").startsWith("desktop-")) return desktopStepHistory;
    return isMobileAuthVisible() ? mobileStepHistory : desktopStepHistory;
}

const MOBILE_SIGNIN_FLOW_STEPS = new Set([
    "mobile-login",
    "mobile-forgot-email",
    "mobile-forgot-otp",
    "mobile-forgot-password",
]);

const DESKTOP_SIGNIN_FLOW_STEPS = new Set([
    "desktop-login",
    "desktop-forgot-email",
    "desktop-forgot-otp",
    "desktop-forgot-password",
]);

const MOBILE_SIGNUP_FLOW_STEPS = new Set([
    "mobile-signup-email",
    "mobile-signup-otp",
    "mobile-signup-password",
    "mobile-setup-pin-choice",
    "mobile-setup-pin",
]);

/** Desktop + mobile auth steps share the page — scope nav to the visible column. */
function getAuthBox(stepId) {
    const isMobile = String(stepId || "").startsWith("mobile-");
    if (isMobile) {
        return document.querySelector(".mobile-auth-box");
    }
    return document.querySelector(".container .auth-inline-box");
}

function isMobileAuthVisible() {
    const mobile = document.querySelector(".mobile-container");
    if (!mobile) return false;
    return window.getComputedStyle(mobile).display !== "none";
}

function syncMobileAuthUi(activeStepId) {
    const mobileRoot = document.querySelector(".mobile-container");
    if (!mobileRoot) return;

    if (!activeStepId || activeStepId === "mobile-start") {
        mobileRoot.classList.remove("mobile-signin-flow", "mobile-signup-flow");
        return;
    }

    const inSignin = MOBILE_SIGNIN_FLOW_STEPS.has(activeStepId);
    const inSignup = MOBILE_SIGNUP_FLOW_STEPS.has(activeStepId);

    mobileRoot.classList.toggle("mobile-signin-flow", inSignin);
    mobileRoot.classList.toggle("mobile-signup-flow", inSignup);
}

function syncDesktopSigninFlow(activeStepId) {
    const desktopBox = document.querySelector(".container .auth-inline-box");
    if (!desktopBox) return;
    desktopBox.classList.toggle(
        "desktop-signin-flow",
        DESKTOP_SIGNIN_FLOW_STEPS.has(activeStepId)
    );
}

function goToStep(stepId) {
    const authBox = getAuthBox(stepId);
    const history = stepHistoryFor(stepId);
    const currentStep = authBox?.querySelector(".auth-step.active");

    if (currentStep) {
        history.push(currentStep.id);
        currentStep.classList.remove("active");
        clearError(currentStep.id);
    }

    const nextStep = document.getElementById(stepId);
    if (nextStep) {
        nextStep.classList.add("active");
        clearError(stepId);
    }

    if (String(stepId).startsWith("mobile-")) {
        syncMobileAuthUi(stepId);
    }
    if (String(stepId).startsWith("desktop-")) {
        syncDesktopSigninFlow(stepId);
    }
}

function goBack() {
    const onMobile = isMobileAuthVisible();
    const history = onMobile ? mobileStepHistory : desktopStepHistory;
    if (history.length === 0) return;

    const authBox = onMobile
        ? document.querySelector(".mobile-auth-box")
        : document.querySelector(".container .auth-inline-box");

    const currentStep = authBox?.querySelector(".auth-step.active");
    if (currentStep) {
        currentStep.classList.remove("active");
        clearError(currentStep.id);
    }

    const prevStepId = history.pop();
    const prevStep = document.getElementById(prevStepId);

    if (prevStep) {
        prevStep.classList.add("active");
        clearError(prevStepId);
    }

    if (onMobile) {
        syncMobileAuthUi(prevStep ? prevStep.id : "");
    } else {
        syncDesktopSigninFlow(prevStep ? prevStep.id : "");
    }
}

function goToLanding() {
    window.location.href = ROUTES.landing;
}

// ================= ERROR HANDLING =================
function getActionButton(step) {
    if (!step) return null;
    return step.querySelector(".signup-btn, .mobile-signup-btn");
}

function showError(stepId, message) {
    const step = document.getElementById(stepId);
    if (!step) return;

    let errorBox = step.querySelector(".auth-error");

    if (!errorBox) {
        errorBox = document.createElement("div");
        errorBox.className = "auth-error";

        const actionButton = getActionButton(step);
        if (actionButton) {
            step.insertBefore(errorBox, actionButton);
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

    const button = getActionButton(step);
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

function authErrorMessage(error) {
    return (error && error.message)
        ? error.message
        : "Server error. Please try again.";
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

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Sending OTP…", "OTP sent");

        const data = await apiPost("/auth/signup/send-otp", {
            email: email
        });

        if (!data.status) {
            dismissAuthPopup();
            showError(currentStepId, data.message || "Unable to send OTP.");
            return;
        }

        authState.email = email;
        if (data.otp) {
            console.info("[BrandBased local dev] Signup OTP:", data.otp);
        }
        await popup;
        popup = null;
        goToStep(nextStepId);
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
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

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Verifying OTP…", "Verified");

        const data = await apiPost("/auth/signup/verify-otp", {
            email: authState.email,
            otp: otp
        });

        if (!data.status) {
            dismissAuthPopup();
            showError(currentStepId, data.message || "OTP verification failed.");
            return;
        }

        await popup;
        popup = null;
        goToStep(nextStepId);
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
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

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Creating account…", "Account created");

        const data = await apiPost("/auth/signup/finish", {
            email: authState.email,
            password: authState.password,
            password_confirmation: authState.password_confirmation
        });

        if (!data.status) {
            dismissAuthPopup();
            showError(currentStepId, data.message || "Unable to create account.");
            return;
        }

        await popup;
        popup = null;
        goToLanding();
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
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

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Creating account…", "Account created");

        const data = await apiPost("/auth/signup/finish", {
            email: authState.email,
            password: authState.password,
            password_confirmation: authState.password_confirmation,
            pin_code: pin
        });

        if (!data.status) {
            dismissAuthPopup();
            showError(currentStepId, data.message || "Unable to create account.");
            return;
        }

        await popup;
        popup = null;
        goToLanding();
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
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

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Signing in…", "Signed in");

        const data = await apiPost("/auth/login", {
            email: email,
            password: password
        });

        if (!data.status) {
            dismissAuthPopup();
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

        await popup;
        popup = null;
        goToLanding();
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
    }
}

// ================= FORGOT PASSWORD (OTP EMAIL) =================

async function sendResetPasswordOtp(currentStepId, nextStepId) {
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

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Sending OTP…", "OTP sent");

        const data = await apiPost("/auth/reset-password/send-otp", {
            email: email,
        });

        if (!data.status) {
            dismissAuthPopup();
            showError(currentStepId, data.message || "Unable to send OTP.");
            return;
        }

        resetPasswordState.email = email;
        await popup;
        popup = null;
        goToStep(nextStepId);
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
    }
}

async function verifyResetPasswordOtp(currentStepId, nextStepId) {
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

    if (!resetPasswordState.email) {
        showError(currentStepId, "Email missing. Please start again.");
        return;
    }

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Verifying OTP…", "Verified");

        const data = await apiPost("/auth/reset-password/verify-otp", {
            email: resetPasswordState.email,
            otp: otp,
        });

        if (!data.status) {
            dismissAuthPopup();
            showError(currentStepId, data.message || "OTP verification failed.");
            return;
        }

        await popup;
        popup = null;
        goToStep(nextStepId);
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
    }
}

async function updateResetPassword(currentStepId, nextStepId) {
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

    if (!resetPasswordState.email) {
        showError(currentStepId, "Email missing. Please start again.");
        return;
    }

    let popup = null;
    try {
        setStepBusy(currentStepId, true);
        popup = showAuthPopup("Updating password…", "Password updated");

        const data = await apiPost("/auth/reset-password/update", {
            email: resetPasswordState.email,
            password: password,
            password_confirmation: confirmPassword,
        });

        if (!data.status) {
            dismissAuthPopup();
            showError(currentStepId, data.message || "Unable to update password.");
            return;
        }

        resetPasswordState.email = "";
        await popup;
        popup = null;
        goToStep(nextStepId);
    } catch (error) {
        dismissAuthPopup();
        console.error(error);
        showError(currentStepId, authErrorMessage(error));
    } finally {
        setStepBusy(currentStepId, false);
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

// Expose handlers for inline onclick (and debugging in DevTools)
if (typeof window !== "undefined") {
    window.sendResetPasswordOtp = sendResetPasswordOtp;
    window.verifyResetPasswordOtp = verifyResetPasswordOtp;
    window.updateResetPassword = updateResetPassword;
    window.goToStep = goToStep;
    window.goBack = goBack;
}